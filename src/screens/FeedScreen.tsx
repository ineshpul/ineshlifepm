import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio, Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { FollowButton } from '../components/FollowButton';
import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { recordVideoView } from '../services/recordVideoView';
import { useAppState } from '../state/appState';
import { normalizeTaskDurationSeconds, useChallengeWindow } from '../state/challenge';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { todayVideoDocId } from '../state/posting';
import { showError } from '../utils/ui';
import { subscribeFollowing, subscribeNotifications, type FollowingRow } from '../services/social';
import { useSettingsPreferences } from '../state/settingsPreferences';

type FeedVideo = {
  id: string;
  username: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  ownerUid: string;
  moderationStatus: string;
  maxDurationSeconds: number;
};

/** Bottom sheet height (instructions + engagement) per reel page — matches Tabs tab bar feel. */
const REEL_BOTTOM_SHEET = 232;
const TAB_BAR_HEIGHT = 58;

function formatTimeLeft(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Pick the feed item that should play: prefer highest reported visible %, else bottom-most row. */
function pickPrimaryViewable(viewableItems: ViewToken[]): FeedVideo | null {
  const vis = viewableItems.filter(
    (v): v is ViewToken & { item: FeedVideo } => Boolean(v.isViewable && v.item && (v.item as FeedVideo).id)
  );
  if (!vis.length) return null;
  let best = vis[0];
  let bestPct = -1;
  for (const v of vis) {
    const pct = (v as { percentVisible?: number }).percentVisible;
    const score = typeof pct === 'number' && Number.isFinite(pct) ? pct : -1;
    if (score > bestPct) {
      bestPct = score;
      best = v;
    }
  }
  if (bestPct < 0) {
    vis.sort((a, b) => (b.index ?? 0) - (a.index ?? 0));
    best = vis[0];
  }
  return (best.item as FeedVideo) ?? null;
}

function FeedPostVideo(props: {
  url: string;
  shouldPlay: boolean;
  isMuted: boolean;
  useNativeControls: boolean;
  maxDurationSeconds: number;
  dataSaver: boolean;
  /** Full-bleed vertical clip (Reels-style); hides native controls for a TikTok-like surface. */
  reel?: boolean;
  /** When autoplay is off: tap the inactive reel to start this clip. */
  onReelActivate?: () => void;
  /** Firestore `videos/{id}` — used for coarse view analytics (callable, throttled). */
  analyticsVideoId?: string;
  videoOwnerUid?: string;
  viewerUid?: string;
}) {
  const {
    url,
    shouldPlay,
    isMuted,
    useNativeControls,
    maxDurationSeconds,
    dataSaver,
    reel = false,
    onReelActivate,
    analyticsVideoId,
    videoOwnerUid,
    viewerUid,
  } = props;
  const videoRef = React.useRef<Video>(null);
  const [status, setStatus] = React.useState<AVPlaybackStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  /** User tapped pause while this reel is still the active slot (feed scroll / focus unchanged). */
  const [userPaused, setUserPaused] = React.useState(false);
  const [pauseFlash, setPauseFlash] = React.useState(false);
  const pauseFlashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRecordedKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    viewRecordedKeyRef.current = null;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    setLoaded(false);
  }, [url]);

  React.useEffect(() => {
    if (!shouldPlay) setUserPaused(false);
  }, [shouldPlay]);

  React.useEffect(
    () => () => {
      if (pauseFlashTimerRef.current) clearTimeout(pauseFlashTimerRef.current);
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    },
    []
  );

  const effectivePlay = shouldPlay && !userPaused;

  React.useEffect(() => {
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
    if (!effectivePlay || !analyticsVideoId || !viewerUid || !videoOwnerUid || viewerUid === videoOwnerUid) {
      return;
    }
    const key = `${analyticsVideoId}:${viewerUid}`;
    if (viewRecordedKeyRef.current === key) return;
    viewTimerRef.current = setTimeout(() => {
      viewTimerRef.current = null;
      viewRecordedKeyRef.current = key;
      void recordVideoView(analyticsVideoId);
    }, 2500);
    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    };
  }, [effectivePlay, analyticsVideoId, viewerUid, videoOwnerUid]);

  React.useEffect(() => {
    const player = videoRef.current;
    if (!player) return;
    if (effectivePlay && loaded) {
      void (async () => {
        try {
          await player.setIsMutedAsync(false);
          await player.setVolumeAsync(1.0);
          await player.playAsync();
        } catch {
          /* native race or unload */
        }
      })();
    } else if (!effectivePlay) {
      // Do not pause while we're waiting to load with shouldPlay true — pauseAsync can stall
      // buffering/autoplay and matches the "videos never start until background" symptom.
      void player.pauseAsync?.();
    }
  }, [effectivePlay, loaded, url]);

  const onPlaybackStatusUpdate = (s: AVPlaybackStatus) => {
    setStatus(s);
    if (s.isLoaded) setLoaded(true);
  };

  const onReelTap = React.useCallback(() => {
    if (!shouldPlay && onReelActivate) {
      onReelActivate();
      setUserPaused(false);
      return;
    }
    if (!shouldPlay) return;
    if (userPaused) {
      setUserPaused(false);
      return;
    }
    setUserPaused(true);
    setPauseFlash(true);
    if (pauseFlashTimerRef.current) clearTimeout(pauseFlashTimerRef.current);
    pauseFlashTimerRef.current = setTimeout(() => {
      pauseFlashTimerRef.current = null;
      setPauseFlash(false);
    }, 550);
  }, [shouldPlay, userPaused, onReelActivate]);

  let remainingSec = maxDurationSeconds;
  if (status?.isLoaded) {
    const durMs =
      status.durationMillis && status.durationMillis > 0
        ? status.durationMillis
        : maxDurationSeconds * 1000;
    const posMs = status.positionMillis ?? 0;
    remainingSec = Math.max(0, Math.ceil((durMs - posMs) / 1000));
  }

  const nativeControls = reel ? false : useNativeControls;
  const resizeMode = reel ? ResizeMode.COVER : ResizeMode.CONTAIN;
  const videoStyle = reel ? StyleSheet.absoluteFillObject : styles.video;

  const reelTapLayer =
    reel && (shouldPlay || onReelActivate) ? (
      <Pressable
        style={styles.reelTouchLayer}
        onPress={onReelTap}
        accessibilityRole="button"
        accessibilityLabel={
          !shouldPlay && onReelActivate
            ? 'Play video'
            : userPaused
              ? 'Play video'
              : 'Pause video'
        }
      >
        {pauseFlash ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <Ionicons name="pause" size={58} color="rgba(255,255,255,0.92)" />
          </View>
        ) : shouldPlay && userPaused ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <View style={styles.reelPlayCircle}>
              <Ionicons name="play" size={42} color="rgba(255,255,255,0.96)" style={{ marginLeft: 4 }} />
            </View>
          </View>
        ) : !shouldPlay && onReelActivate ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <View style={styles.reelPlayCircle}>
              <Ionicons name="play" size={42} color="rgba(255,255,255,0.96)" style={{ marginLeft: 4 }} />
            </View>
          </View>
        ) : null}
      </Pressable>
    ) : null;

  return (
    <View style={reel ? styles.videoStageReel : styles.videoStage}>
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={videoStyle}
        resizeMode={resizeMode}
        shouldPlay={effectivePlay}
        isMuted={isMuted}
        isLooping={reel}
        volume={1.0}
        useNativeControls={nativeControls}
        progressUpdateIntervalMillis={dataSaver ? 1000 : 250}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={() => {
          // If the first autoplay attempt races with load on some devices,
          // the user can tap to retry; we also avoid keeping "paused" stuck.
          setLoaded(false);
          setUserPaused(false);
        }}
      />
      {reelTapLayer}
      <View style={styles.timerBar} pointerEvents="none">
        <Text style={styles.timerText}>{formatTimeLeft(remainingSec)} left</Text>
      </View>
    </View>
  );
}

export function FeedScreen() {
  const isFocused = useIsFocused();
  const nav = useNavigation<any>();
  const { preferences } = useSettingsPreferences();
  const { hasPostedToday, clearPostedOverride } = useAppState();
  const { user } = useAuth();
  const win = useChallengeWindow();

  React.useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, []);
  const [videos, setVideos] = React.useState<FeedVideo[]>([]);
  /** False until auth is ready and we have had at least one merge from Firestore listeners. */
  const [feedHydrated, setFeedHydrated] = React.useState(false);
  const [followingRows, setFollowingRows] = React.useState<FollowingRow[]>([]);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  /** Lifts the reel bottom sheet above the keyboard (fixed-height KAV was ineffective here). */
  const [keyboardSheetBottom, setKeyboardSheetBottom] = React.useState(0);
  const engagementScrollRefs = React.useRef<Record<string, ScrollView | null>>({});
  const flatListRef = React.useRef<FlatList<FeedVideo>>(null);

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [slotHeight, setSlotHeight] = React.useState(0);
  const onSlotLayout = React.useCallback((e: LayoutChangeEvent) => {
    const h = Math.floor(e.nativeEvent.layout.height);
    if (h > 0) setSlotHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
  }, []);
  const pageHeight = React.useMemo(() => {
    if (slotHeight > 0) return slotHeight;
    return Math.max(380, windowHeight - insets.top - insets.bottom - TAB_BAR_HEIGHT - 52);
  }, [slotHeight, windowHeight, insets.top, insets.bottom]);

  const displayVideos = React.useMemo(() => {
    let v = videos;
    if (preferences.feedType === 'friends' && user?.uid) {
      const fu = new Set(followingRows.map((f) => f.targetUid));
      v = v.filter((item) => item.ownerUid === user.uid || fu.has(item.ownerUid));
    }
    v = v.filter((item) => !preferences.blockedUsernames.includes(item.username));
    v = v.filter((item) => !preferences.mutedUsernames.includes(item.username));
    return v;
  }, [
    videos,
    preferences.feedType,
    preferences.blockedUsernames,
    preferences.mutedUsernames,
    user?.uid,
    followingRows,
  ]);

  /** FlatList is PureComponent-ish: include focus in `extraData` so rows re-render when `shouldPlay` should flip. */
  useFocusEffect(
    React.useCallback(() => {
      const id = requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
      return () => cancelAnimationFrame(id);
    }, [])
  );

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardSheetBottom(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardSheetBottom(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  React.useEffect(() => {
    return subscribeFollowing(user?.uid, setFollowingRows);
  }, [user?.uid]);

  React.useEffect(() => {
    return subscribeNotifications(user?.uid, (rows) =>
      setUnreadNotifications(rows.filter((r) => !r.read).length)
    );
  }, [user?.uid]);

  const viewabilityConfig = React.useMemo(
    () => ({
      // Reel pages are tall; a lower threshold keeps the active index in sync with paging.
      itemVisiblePercentThreshold: 35,
      minimumViewTime: 80,
      waitForInteraction: false,
    }),
    []
  );

  const onViewableItemsChangedRef = React.useRef(
    (_info: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {}
  );
  onViewableItemsChangedRef.current = ({ viewableItems }) => {
    const next = pickPrimaryViewable(viewableItems);
    if (next?.id) setActiveVideoId(next.id);
  };

  const viewabilityConfigCallbackPairs = React.useMemo(
    () => [
      {
        viewabilityConfig,
        onViewableItemsChanged: (info: { viewableItems: ViewToken[]; changed: ViewToken[] }) =>
          onViewableItemsChangedRef.current(info),
      },
    ],
    [viewabilityConfig]
  );

  React.useEffect(() => {
    setActiveVideoId(null);
  }, [win.dateKey]);

  React.useEffect(() => {
    if (displayVideos.length === 0) {
      setActiveVideoId(null);
      return;
    }
    setActiveVideoId((cur) =>
      cur && displayVideos.some((v) => v.id === cur) ? cur : displayVideos[0].id
    );
  }, [displayVideos]);

  /** After posting (or first load), reel rows can mount before viewability runs; sync scroll + active id once. */
  const prevFeedNonEmptyCountRef = React.useRef(0);
  React.useEffect(() => {
    if (!hasPostedToday) {
      prevFeedNonEmptyCountRef.current = 0;
      return;
    }
    if (!feedHydrated || pageHeight <= 40) return;

    const n = displayVideos.length;
    if (n === 0) {
      prevFeedNonEmptyCountRef.current = 0;
      return;
    }

    const wasEmpty = prevFeedNonEmptyCountRef.current === 0;
    prevFeedNonEmptyCountRef.current = n;
    if (!wasEmpty) return;

    const firstId = displayVideos[0]?.id;
    const handle = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
        if (firstId) setActiveVideoId(firstId);
      });
    });
    return () => handle.cancel?.();
  }, [hasPostedToday, feedHydrated, pageHeight, displayVideos]);

  const confirmDelete = (item: FeedVideo) => {
    if (!user?.uid || item.ownerUid !== user.uid) return;
    Alert.alert(
      'Delete video?',
      'This removes your post, comments, and likes. You can record again for that day if this was your only post.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setDeletingId(item.id);
              try {
                await deleteOwnedVideo({ videoId: item.id, viewerUid: user.uid });
                clearPostedOverride();
              } catch (e) {
                showError('Delete failed', e);
              } finally {
                setDeletingId(null);
              }
            })(),
        },
      ]
    );
  };

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid || !hasPostedToday) {
      setVideos([]);
      setFeedHydrated(true);
      return;
    }

    setFeedHydrated(false);
    let cancelled = false;
    let approvedUnsub: (() => void) | undefined;
    let mineUnsub: (() => void) | null = null;
    let approvedDocs: FeedVideo[] = [];
    let mineDocs: FeedVideo[] = [];
    let approvedListenerSeen = false;
    let mineListenerSeen = false;

    const bumpHydrated = () => {
      if (cancelled) return;
      if (approvedListenerSeen && mineListenerSeen) setFeedHydrated(true);
    };

    const merge = () => {
      const map = new Map<string, FeedVideo>();
      for (const v of [...mineDocs, ...approvedDocs]) {
        if (!v.url) continue;
        map.set(v.id, v);
      }
      const merged = Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
      setVideos(merged);
    };

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setFeedHydrated(true);
    }, 15_000);

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled) return;

        // Avoid orderBy here so the feed works before composite indexes are deployed; merge() sorts by time.
        const approvedQ = query(
          collection(firestore(), 'videos'),
          where('challengeDate', '==', win.dateKey),
          where('moderationStatus', '==', 'approved'),
          limit(200)
        );

        approvedUnsub = onSnapshot(
          approvedQ,
          (snap) => {
            approvedDocs = snap.docs.map((d) => {
              const data: any = d.data();
              const createdAtMs =
                typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
              return {
                id: d.id,
                username: String(data?.username ?? 'user'),
                prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
                url: String(data?.url ?? ''),
                createdAtMs,
                ownerUid: String(data?.uid ?? ''),
                moderationStatus: String(data?.moderationStatus ?? 'approved'),
                maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
              };
            });
            merge();
            approvedListenerSeen = true;
            bumpHydrated();
          },
          () => {
            approvedDocs = [];
            merge();
            approvedListenerSeen = true;
            bumpHydrated();
          }
        );

        const mineRef = doc(firestore(), 'videos', todayVideoDocId(user.uid, win.dateKey));
        mineUnsub = onSnapshot(
          mineRef,
          (snap) => {
            if (!snap.exists()) {
              mineDocs = [];
            } else {
              const data: any = snap.data();
              const createdAtMs =
                typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
              mineDocs = [
                {
                  id: snap.id,
                  username: String(data?.username ?? 'user'),
                  prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
                  url: String(data?.url ?? ''),
                  createdAtMs,
                  ownerUid: String(data?.uid ?? ''),
                  moderationStatus: String(data?.moderationStatus ?? 'pending'),
                  maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
                },
              ];
            }
            merge();
            mineListenerSeen = true;
            bumpHydrated();
          },
          () => {
            mineDocs = [];
            merge();
            mineListenerSeen = true;
            bumpHydrated();
          }
        );
      })
      .catch(() => {
        if (!cancelled) setFeedHydrated(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      approvedUnsub?.();
      mineUnsub?.();
    };
  }, [win.dateKey, user?.uid, hasPostedToday]);

  if (!hasPostedToday) {
    return (
      <Screen style={styles.gateScreen}>
        <View style={styles.lockIcon}>
          <Text style={styles.lockEmoji}>🔒</Text>
        </View>
        <Text style={styles.gateTitle}>Take the leap to continue</Text>
        <Text style={styles.gateBody}>
          Post today’s challenge to unlock the feed and see what everyone else is doing.
        </Text>
        <PrimaryButton
          title="Leap"
          variant="green"
          onPress={() => nav.navigate('Record')}
          style={styles.gateCta}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.feedScreen}>
      <View style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Brandmark size={36} />
            <View>
              <Text style={styles.headerTitle}>Daily Feed</Text>
            </View>
          </View>
          {user?.uid ? (
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => nav.navigate('Notifications')}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={22} color={colors.text} />
                {unreadNotifications > 0 ? (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>
                      {unreadNotifications > 99 ? '99+' : String(unreadNotifications)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.notifBtn}
                onPress={() => nav.navigate('Settings')}
                accessibilityRole="button"
                accessibilityLabel="Settings"
              >
                <Ionicons name="settings-outline" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.feedSlot} onLayout={onSlotLayout}>
        <FlatList
          ref={flatListRef}
          style={styles.reelList}
          data={displayVideos}
          keyExtractor={(x) => x.id}
          extraData={`${pageHeight}-${activeVideoId}-${feedHydrated}-${isFocused ? 1 : 0}`}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
          contentContainerStyle={displayVideos.length === 0 ? { flexGrow: 1 } : undefined}
          pagingEnabled
          snapToInterval={pageHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={false}
          windowSize={5}
          getItemLayout={
            slotHeight > 0 && pageHeight > 40
              ? (_, index) => ({
                  length: pageHeight,
                  offset: pageHeight * index,
                  index,
                })
              : undefined
          }
          ListEmptyComponent={
            !feedHydrated ? (
              <View style={[styles.empty, styles.emptyLoading, { minHeight: pageHeight }]}>
                <ActivityIndicator size="large" color={colors.moss} />
                <Text style={styles.emptyLoadingText}>Loading feed…</Text>
              </View>
            ) : (
              <View style={[styles.empty, { minHeight: pageHeight }]}>
                <Text style={styles.emptyTitle}>No posts yet.</Text>
                <Text style={styles.emptyBody}>Be the first to Leap today.</Text>
                <PrimaryButton
                  title="Leap"
                  variant="green"
                  onPress={() => nav.navigate('Record')}
                  style={{ width: 200, borderRadius: 30, marginTop: 10 }}
                />
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={[styles.reelPage, { height: pageHeight }]}>
              <View style={[styles.reelVideoSlot, { bottom: REEL_BOTTOM_SHEET }]}>
                <FeedPostVideo
                  reel
                  url={item.url}
                  shouldPlay={isFocused && activeVideoId === item.id}
                  isMuted={false}
                  useNativeControls
                  maxDurationSeconds={item.maxDurationSeconds}
                  dataSaver={preferences.dataSaver}
                  analyticsVideoId={item.id}
                  videoOwnerUid={item.ownerUid}
                  viewerUid={user?.uid}
                  onReelActivate={() => setActiveVideoId(item.id)}
                />
              </View>

              <View
                style={[
                  styles.reelSheet,
                  { height: REEL_BOTTOM_SHEET },
                  keyboardSheetBottom > 0 ? { bottom: keyboardSheetBottom } : undefined,
                ]}
              >
                <View style={styles.reelSheetTop}>
                  <View style={styles.reelAvatar}>
                    <Text style={styles.reelAvatarText}>{item.username[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={styles.reelTextCol}>
                    <TouchableOpacity
                      onPress={() =>
                        nav.navigate('UserProfile', { uid: item.ownerUid, username: item.username })
                      }
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Open @${item.username} profile`}
                    >
                      <Text style={styles.reelUser}>@{item.username}</Text>
                    </TouchableOpacity>
                    <Text style={styles.reelPrompt} numberOfLines={2}>
                      {item.prompt}
                    </Text>
                  </View>
                  <View style={styles.reelSheetActions}>
                    {user?.uid && item.ownerUid !== user.uid ? (
                      <FollowButton
                        viewerUid={user.uid}
                        viewerUsername={user.username}
                        targetUid={item.ownerUid}
                        targetUsername={item.username}
                      />
                    ) : null}
                    {user?.uid && item.ownerUid === user.uid ? (
                      <TouchableOpacity
                        onPress={() => confirmDelete(item)}
                        disabled={deletingId === item.id}
                        hitSlop={8}
                      >
                        <Text style={styles.deleteLink}>
                          {deletingId === item.id ? '…' : 'Delete'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
                {user?.uid ? (
                  <ScrollView
                    ref={(r) => {
                      engagementScrollRefs.current[item.id] = r;
                    }}
                    style={styles.reelEngagementScroll}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                  >
                    <FeedPostEngagement
                      videoId={item.id}
                      videoOwnerUid={item.ownerUid}
                      shareTitle={`${item.username} on Leap`}
                      shareUrl={item.url}
                      viewerUid={user.uid}
                      viewerUsername={user.username}
                      onCommentComposerFocus={() => {
                        requestAnimationFrame(() => {
                          engagementScrollRefs.current[item.id]?.scrollToEnd({ animated: true });
                        });
                      }}
                    />
                  </ScrollView>
                ) : null}
              </View>
            </View>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 12,
  },
  feedScreen: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 12,
  },
  feedSlot: {
    flex: 1,
    minHeight: 0,
  },
  reelList: {
    flex: 1,
  },
  reelPage: {
    width: '100%',
    backgroundColor: colors.bg,
  },
  reelVideoSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  reelSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'column',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 6,
  },
  reelSheetTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  reelAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelAvatarText: {
    fontWeight: '900',
    color: colors.text,
  },
  reelTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  reelUser: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  reelPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  reelSheetActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  reelEngagementScroll: {
    flex: 1,
    minHeight: 0,
  },
  videoStageReel: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#0B1020',
  },
  reelTouchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  reelIconCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  reelPlayCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: 6,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  notifBadge: {
    position: 'absolute',
    right: 2,
    top: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.coral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '900',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  list: {
    paddingBottom: 10,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '900',
    color: colors.text,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardTitleActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  deleteLink: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.coral,
    paddingTop: 2,
  },
  user: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  caption: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  videoStage: {
    marginTop: 6,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#0B1020',
    width: '100%',
    aspectRatio: 9 / 16,
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  timerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  timerText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  empty: {
    paddingTop: 16,
    alignItems: 'center',
    gap: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  emptyBody: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyLoading: {
    justifyContent: 'center',
    gap: 14,
  },
  emptyLoadingText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  gateScreen: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6F4D7',
    marginBottom: 8,
  },
  lockEmoji: {
    fontSize: 26,
  },
  gateTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  gateBody: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '600',
    paddingHorizontal: 10,
  },
  gateCta: {
    width: 220,
    borderRadius: 30,
    marginTop: 8,
  },
});


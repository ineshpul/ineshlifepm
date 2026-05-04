import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { FollowButton } from '../components/FollowButton';
import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { FeedPostVideo } from '../components/FeedPostVideo';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { navigateToRecord } from '../navigation/navigationHelpers';
import { useAppState } from '../state/appState';
import { normalizeTaskDurationSeconds, useChallengeWindow } from '../state/challenge';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { todayVideoDocId } from '../state/posting';
import { showError } from '../utils/ui';
import { useCanViewEveryoneFeed } from '../state/posting';
import { subscribeFollowing, subscribeNotifications, type FollowingRow } from '../services/social';
import { useSettingsPreferences } from '../state/settingsPreferences';
import {
  computeFeedViewingFromNow,
  normalizeNyDateKey,
  nyDateKey,
  nyDateKeyToSortUtcMs,
  nyRecentChallengeDateKeys,
  prevNyDateKey,
  prioritizedChallengeDateInForVideosQuery,
} from '../utils/nyTime';

type FeedVideo = {
  id: string;
  username: string;
  prompt: string;
  url: string;
  createdAtMs: number;
  ownerUid: string;
  moderationStatus: string;
  maxDurationSeconds: number;
  /** NY calendar day for this post (`videos.challengeDate`). */
  challengeDate: string;
};

/** Bottom sheet height (instructions + engagement) per reel page — matches Tabs tab bar feel. */
const REEL_BOTTOM_SHEET = 232;
const TAB_BAR_HEIGHT = 58;
/** Approved-query window: today + prior NY days (Firestore `in` max 30). */
const FEED_DAY_WINDOW = 14;

/** Must be a stable reference — `viewabilityConfigCallbackPairs` cannot change after mount (RN FlatList). */
const FEED_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 35,
  minimumViewTime: 80,
  waitForInteraction: false,
} as const;

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

export function FeedScreen() {
  const isFocused = useIsFocused();
  const nav = useNavigation<any>();
  const { preferences, patch } = useSettingsPreferences();
  const { clearPostedOverride } = useAppState();
  const { user } = useAuth();
  const win = useChallengeWindow();
  /** Noon-to-noon “post to unlock” cycle — must match `useCanViewEveryoneFeed` / `todayVideoDocId` for your draft. */
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  const canViewEveryoneFeed = useCanViewEveryoneFeed(user?.uid);

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
  const flatListRef = React.useRef<FlatList<FeedVideo>>(null);
  /** Reel sheet `bottom` must use overlap with keyboard vs this slot’s bottom (tab bar is below; window-height math over-lifts). */
  const feedSlotRef = React.useRef<View>(null);

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

  const previousChallengeDateKey = React.useMemo(
    () => prevNyDateKey(viewingChallengeDateKey),
    [viewingChallengeDateKey]
  );

  const displayVideos = React.useMemo(() => {
    let v = videos;
    if (preferences.feedType === 'friends' && user?.uid) {
      const fu = new Set(followingRows.map((f) => f.targetUid));
      v = v.filter((item) => item.ownerUid === user.uid || fu.has(item.ownerUid));
    }
    v = v.filter((item) => !preferences.blockedUsernames.includes(item.username));
    v = v.filter((item) => !preferences.mutedUsernames.includes(item.username));
    v = v.filter((item) => !preferences.hiddenVideoIds.includes(item.id));
    return v;
  }, [
    videos,
    preferences.feedType,
    preferences.blockedUsernames,
    preferences.mutedUsernames,
    preferences.hiddenVideoIds,
    user?.uid,
    followingRows,
  ]);

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      const ec = e.endCoordinates;
      const top = typeof ec.screenY === 'number' ? ec.screenY : null;
      const fallback =
        top != null && windowHeight > 0 ? Math.max(0, windowHeight - top) : Math.max(0, ec.height);
      const node = feedSlotRef.current;
      if (node && top != null) {
        node.measureInWindow((fx, fy, fw, fh) => {
          const anchorBottom = fy + fh;
          setKeyboardSheetBottom(Math.max(0, anchorBottom - top));
        });
      } else {
        setKeyboardSheetBottom(fallback);
      }
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardSheetBottom(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [windowHeight]);

  React.useEffect(() => {
    return subscribeFollowing(user?.uid, setFollowingRows);
  }, [user?.uid]);

  React.useEffect(() => {
    return subscribeNotifications(user?.uid, (rows) =>
      setUnreadNotifications(rows.filter((r) => !r.read).length)
    );
  }, [user?.uid]);

  const onViewableItemsChanged = React.useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      const next = pickPrimaryViewable(viewableItems);
      if (next?.id) setActiveVideoId(next.id);
    },
    []
  );

  React.useEffect(() => {
    setActiveVideoId(null);
  }, [win.dateKey, viewingChallengeDateKey]);

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
    if (!canViewEveryoneFeed) {
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
  }, [canViewEveryoneFeed, feedHydrated, pageHeight, displayVideos]);

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
    if (!isFirebaseConfigured() || !user?.uid || !canViewEveryoneFeed) {
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
      /**
       * Everyone feed: **newest `challengeDate` (NY) first**, then older days in order (newer → older).
       * Within the same challenge day, **newest posts first**. After submit time for a day has passed,
       * that day stays ordered by date — the latest challenge day in the feed remains at the top until
       * a newer challenge day has posts (12:00 AM ET rolls the calendar; `challengeDate` on docs is the source of truth).
       */
      const merged = Array.from(map.values()).sort((a, b) => {
        const msB = nyDateKeyToSortUtcMs(b.challengeDate, 0);
        const msA = nyDateKeyToSortUtcMs(a.challengeDate, 0);
        if (msB !== msA) return msB - msA;
        return b.createdAtMs - a.createdAtMs;
      });
      setVideos(merged);
    };

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setFeedHydrated(true);
    }, 15_000);

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled) return;

        const calToday = nyDateKey();
        const anchorCandidates = [
          normalizeNyDateKey(win.dateKey, calToday),
          normalizeNyDateKey(calToday, calToday),
          normalizeNyDateKey(viewingChallengeDateKey, calToday),
        ];
        const anchorKey = anchorCandidates.reduce((best, k) =>
          nyDateKeyToSortUtcMs(k, 0) > nyDateKeyToSortUtcMs(best, 0) ? k : best
        );
        let challengeDateIn = prioritizedChallengeDateInForVideosQuery(
          anchorKey,
          FEED_DAY_WINDOW,
          viewingChallengeDateKey
        );
        if (challengeDateIn.length === 0) {
          challengeDateIn = [normalizeNyDateKey(viewingChallengeDateKey, calToday)];
        }
        // Avoid orderBy so indexes stay minimal; merge() sorts by challengeDate + time.
        const approvedQ = query(
          collection(firestore(), 'videos'),
          where('challengeDate', 'in', challengeDateIn),
          where('moderationStatus', '==', 'approved'),
          limit(400)
        );

        approvedUnsub = onSnapshot(
          approvedQ,
          (snap) => {
            approvedDocs = snap.docs.map((d) => {
              const data: any = d.data();
              const createdAtMs =
                typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
              const rawCd = data?.challengeDate;
              const cdRaw =
                rawCd && typeof (rawCd as { toDate?: () => Date }).toDate === 'function'
                  ? nyDateKey((rawCd as { toDate: () => Date }).toDate())
                  : String(rawCd ?? '');
              const challengeDate = normalizeNyDateKey(cdRaw, viewingChallengeDateKey);
              return {
                id: d.id,
                username: String(data?.username ?? 'user'),
                prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
                url: String(data?.url ?? ''),
                createdAtMs,
                ownerUid: String(data?.uid ?? ''),
                moderationStatus: String(data?.moderationStatus ?? 'approved'),
                maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
                challengeDate,
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

        const mineRef = doc(firestore(), 'videos', todayVideoDocId(user.uid, viewingChallengeDateKey));
        mineUnsub = onSnapshot(
          mineRef,
          (snap) => {
            if (!snap.exists()) {
              mineDocs = [];
            } else {
              const data: any = snap.data();
              const createdAtMs =
                typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
              const rawMineCd = data?.challengeDate;
              const mineCdRaw =
                rawMineCd && typeof (rawMineCd as { toDate?: () => Date }).toDate === 'function'
                  ? nyDateKey((rawMineCd as { toDate: () => Date }).toDate())
                  : String(rawMineCd ?? '');
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
                  challengeDate: normalizeNyDateKey(mineCdRaw, viewingChallengeDateKey),
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
  }, [win.dateKey, viewingChallengeDateKey, user?.uid, canViewEveryoneFeed]);

  if (!canViewEveryoneFeed) {
    return (
      <Screen style={styles.gateScreen}>
        <View style={styles.lockIcon}>
          <Text style={styles.lockEmoji}>🔒</Text>
        </View>
        <Text style={styles.gateTitle}>Take the leap to continue</Text>
        <Text style={styles.gateBody}>
          Post the current challenge (noon–noon Eastern) to unlock the feed. It locks again at the next 12:00
          PM ET until you post for that new cycle.
        </Text>
        <PrimaryButton
          title="Leap"
          variant="green"
          onPress={() => navigateToRecord(nav)}
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

      <View ref={feedSlotRef} style={styles.feedSlot} onLayout={onSlotLayout} collapsable={false}>
        <FlatList
          ref={flatListRef}
          style={styles.reelList}
          data={displayVideos}
          keyExtractor={(x) => x.id}
          extraData={`${pageHeight}-${activeVideoId}-${feedHydrated}-${isFocused ? 1 : 0}`}
          viewabilityConfig={FEED_VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          contentContainerStyle={displayVideos.length === 0 ? { flexGrow: 1 } : undefined}
          pagingEnabled
          snapToInterval={pageHeight}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
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
                  onPress={() => navigateToRecord(nav)}
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
                    {item.challengeDate && item.challengeDate !== viewingChallengeDateKey ? (
                      <Text style={styles.reelDayTag}>
                        {item.challengeDate === previousChallengeDateKey
                          ? 'Previous challenge'
                          : item.challengeDate}
                      </Text>
                    ) : null}
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
                  <View style={styles.reelEngagementScroll}>
                    <FeedPostEngagement
                      reelLayout
                      videoId={item.id}
                      videoOwnerUid={item.ownerUid}
                      videoOwnerUsername={item.username}
                      shareTitle={`${item.username} on Leap`}
                      shareUrl={item.url}
                      viewerUid={user.uid}
                      viewerUsername={user.username}
                    />
                  </View>
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
    marginBottom: 4,
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
  reelDayTag: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.moss,
    marginBottom: 2,
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


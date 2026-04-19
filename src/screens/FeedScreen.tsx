import * as React from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type ViewToken,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { Brandmark } from '../components/Brandmark';
import { FollowButton } from '../components/FollowButton';
import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { useAppState } from '../state/appState';
import { normalizeTaskDurationSeconds, useChallengeWindow } from '../state/challenge';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
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

/** One preview credit per challenge day (survives leaving/reopening the Feed tab). */
let lastPreviewChargeDateKey: string | null = null;

function formatTimeLeft(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function FeedPostVideo(props: {
  url: string;
  shouldPlay: boolean;
  isMuted: boolean;
  useNativeControls: boolean;
  maxDurationSeconds: number;
  showPreviewBadge: boolean;
  dataSaver: boolean;
}) {
  const { url, shouldPlay, isMuted, useNativeControls, maxDurationSeconds, showPreviewBadge, dataSaver } =
    props;
  const [status, setStatus] = React.useState<AVPlaybackStatus | null>(null);

  const onPlaybackStatusUpdate = (s: AVPlaybackStatus) => {
    setStatus(s);
  };

  let remainingSec = maxDurationSeconds;
  if (status?.isLoaded) {
    const durMs =
      status.durationMillis && status.durationMillis > 0
        ? status.durationMillis
        : maxDurationSeconds * 1000;
    const posMs = status.positionMillis ?? 0;
    remainingSec = Math.max(0, Math.ceil((durMs - posMs) / 1000));
  }

  return (
    <View style={styles.videoStage}>
      <Video
        source={{ uri: url }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={shouldPlay}
        isMuted={isMuted}
        volume={1.0}
        useNativeControls={useNativeControls}
        progressUpdateIntervalMillis={dataSaver ? 1000 : 250}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />
      <View style={styles.timerBar} pointerEvents="none">
        <Text style={styles.timerText}>{formatTimeLeft(remainingSec)} left</Text>
      </View>
      {showPreviewBadge ? <Text style={styles.previewBadge}>PREVIEW</Text> : null}
    </View>
  );
}

export function FeedScreen() {
  const nav = useNavigation<any>();
  const { preferences } = useSettingsPreferences();
  const { hasPostedToday, previewViewsRemaining, markPreviewView, clearPostedOverride } = useAppState();
  const { user } = useAuth();
  const win = useChallengeWindow();
  const [videos, setVideos] = React.useState<FeedVideo[]>([]);
  const [followingRows, setFollowingRows] = React.useState<FollowingRow[]>([]);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [manualPlayId, setManualPlayId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);

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

  React.useEffect(() => {
    return subscribeFollowing(user?.uid, setFollowingRows);
  }, [user?.uid]);

  React.useEffect(() => {
    return subscribeNotifications(user?.uid, (rows) =>
      setUnreadNotifications(rows.filter((r) => !r.read).length)
    );
  }, [user?.uid]);

  const viewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 55, minimumViewTime: 120 }),
    []
  );

  const onViewableItemsChanged = React.useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const next = viewableItems.find((v) => v.isViewable)?.item as FeedVideo | undefined;
      if (next?.id) setActiveVideoId(next.id);
    },
    []
  );

  React.useEffect(() => {
    setActiveVideoId(null);
  }, [win.dateKey]);

  React.useEffect(() => {
    if (displayVideos.length === 0) {
      setActiveVideoId(null);
      setManualPlayId(null);
      return;
    }
    setActiveVideoId((cur) =>
      cur && displayVideos.some((v) => v.id === cur) ? cur : displayVideos[0].id
    );
    setManualPlayId((cur) =>
      cur && displayVideos.some((v) => v.id === cur) ? cur : null
    );
  }, [displayVideos]);

  React.useEffect(() => {
    if (hasPostedToday || !displayVideos.length || !activeVideoId) return;
    if (lastPreviewChargeDateKey === win.dateKey) return;
    lastPreviewChargeDateKey = win.dateKey;
    markPreviewView();
  }, [win.dateKey, hasPostedToday, displayVideos.length, activeVideoId, markPreviewView]);

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
    if (!isFirebaseConfigured()) {
      setVideos([]);
      return;
    }

    // Avoid orderBy here so the feed works before composite indexes are deployed; merge() sorts by time.
    const approvedQ = query(
      collection(firestore(), 'videos'),
      where('challengeDate', '==', win.dateKey),
      where('moderationStatus', '==', 'approved'),
      limit(200)
    );

    let mineUnsub: (() => void) | null = null;
    let approvedDocs: FeedVideo[] = [];
    let mineDocs: FeedVideo[] = [];

    const merge = () => {
      const map = new Map<string, FeedVideo>();
      for (const v of [...mineDocs, ...approvedDocs]) {
        if (!v.url) continue;
        map.set(v.id, v);
      }
      const merged = Array.from(map.values()).sort((a, b) => b.createdAtMs - a.createdAtMs);
      setVideos(merged);
    };

    const approvedUnsub = onSnapshot(
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
      },
      () => {
        approvedDocs = [];
        merge();
      }
    );

    if (user?.uid) {
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
        },
        () => {
          mineDocs = [];
          merge();
        }
      );
    } else {
      mineDocs = [];
      merge();
    }

    return () => {
      approvedUnsub();
      mineUnsub?.();
    };
  }, [win.dateKey, user?.uid]);

  if (!hasPostedToday && previewViewsRemaining <= 0) {
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
          title="RECORD NOW"
          variant="green"
          onPress={() => nav.navigate('Record')}
          style={styles.gateCta}
        />
      </Screen>
    );
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Brandmark size={36} />
          <View>
            <Text style={styles.headerTitle}>{hasPostedToday ? 'Daily Feed' : 'Preview'}</Text>
            {!hasPostedToday && (
              <Text style={styles.headerSub}>{previewViewsRemaining} previews left</Text>
            )}
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
              <Ionicons name="notifications-outline" size={24} color={colors.text} />
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
              <Ionicons name="settings-outline" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <FlatList
        contentContainerStyle={styles.list}
        data={displayVideos}
        keyExtractor={(x) => x.id}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No posts yet.</Text>
            <Text style={styles.emptyBody}>Be the first to take the leap today.</Text>
            <PrimaryButton
              title="RECORD"
              variant="green"
              onPress={() => nav.navigate('Record')}
              style={{ width: 200, borderRadius: 30, marginTop: 10 }}
            />
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.username[0]?.toUpperCase()}</Text>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTitleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.user}>{item.username}</Text>
                  <Text style={styles.caption}>{item.prompt}</Text>
                </View>
                <View style={styles.cardTitleActions}>
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
                      <Text style={styles.deleteLink}>{deletingId === item.id ? '…' : 'Delete'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              {preferences.autoPlayVideos ? (
                <FeedPostVideo
                  url={item.url}
                  shouldPlay={activeVideoId === item.id}
                  isMuted={false}
                  useNativeControls={hasPostedToday}
                  maxDurationSeconds={item.maxDurationSeconds}
                  showPreviewBadge={!hasPostedToday}
                  dataSaver={preferences.dataSaver}
                />
              ) : (
                <Pressable
                  onPress={() =>
                    setManualPlayId((id) => (id === item.id ? null : item.id))
                  }
                >
                  <FeedPostVideo
                    url={item.url}
                    shouldPlay={manualPlayId === item.id}
                    isMuted={false}
                    useNativeControls={hasPostedToday}
                    maxDurationSeconds={item.maxDurationSeconds}
                    showPreviewBadge={!hasPostedToday}
                    dataSaver={preferences.dataSaver}
                  />
                </Pressable>
              )}

              {user?.uid ? (
                <FeedPostEngagement
                  videoId={item.id}
                  videoOwnerUid={item.ownerUid}
                  shareTitle={`${item.username} on Leap`}
                  shareUrl={item.url}
                  viewerUid={user.uid}
                  viewerUsername={user.username}
                />
              ) : null}
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    gap: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  headerSub: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
  },
  list: {
    paddingBottom: 18,
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    gap: 6,
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
    marginTop: 10,
    borderRadius: 16,
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
  previewBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: colors.white,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '900',
  },
  empty: {
    paddingTop: 30,
    alignItems: 'center',
    gap: 6,
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
  gateScreen: {
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
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


import * as React from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { FlatList, ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

import { Brandmark } from '../components/Brandmark';
import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { useAuth } from '../state/auth';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { showError } from '../utils/ui';
import { FeedPostVideo } from '../components/FeedPostVideo';
import { useSettingsPreferences } from '../state/settingsPreferences';

type LeapVideo = {
  id: string;
  username: string;
  prompt: string;
  url: string;
  /** Companion PIP clip for BeReal-style dual-camera posts. */
  secondaryUrl?: string;
  createdAtMs: number;
  ownerUid: string;
  moderationStatus: string;
  maxDurationSeconds: number;
};

const REEL_BOTTOM_SHEET = 232;

export function YourLeapsScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const { preferences } = useSettingsPreferences();
  const isFocused = useIsFocused();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /** My leaps is a stack screen (no bottom tab); do not reserve tab bar height. */
  const bottomTabReserve = 0;
  const [videos, setVideos] = React.useState<LeapVideo[]>([]);
  const [hydrated, setHydrated] = React.useState(false);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [slotHeight, setSlotHeight] = React.useState(0);
  const engagementScrollRefs = React.useRef<
    Record<string, { scrollToEnd: (o?: { animated?: boolean }) => void } | null>
  >({});
  const flatListRef = React.useRef<FlatList<LeapVideo>>(null);

  const pageHeight = React.useMemo(() => {
    if (slotHeight > 0) return slotHeight;
    return Math.max(380, windowHeight - insets.top - insets.bottom - bottomTabReserve - 52);
  }, [slotHeight, windowHeight, insets.top, insets.bottom]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setVideos([]);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    const q = query(collection(firestore(), 'videos'), where('uid', '==', user.uid), limit(40));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => {
            const data: any = d.data();
            if (data?.deleted) return null;
            const createdAtMs =
              typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
            const secondaryUrl = String(data?.secondaryUrl ?? '').trim();
            return {
              id: d.id,
              username: String(data?.username ?? user?.username ?? 'user'),
              prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
              url: String(data?.url ?? ''),
              ...(secondaryUrl ? { secondaryUrl } : {}),
              createdAtMs,
              ownerUid: user.uid,
              moderationStatus: String(data?.moderationStatus ?? ''),
              maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
            } satisfies LeapVideo;
          })
          .filter(Boolean) as LeapVideo[];
        rows.sort((a, b) => b.createdAtMs - a.createdAtMs);
        setVideos(rows.slice(0, 30));
        setHydrated(true);
      },
      () => {
        setVideos([]);
        setHydrated(true);
      }
    );
    return () => unsub();
  }, [user?.uid, user?.username]);

  useFocusEffect(
    React.useCallback(() => {
      const id = requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
      return () => cancelAnimationFrame(id);
    }, [])
  );

  const viewabilityConfig = React.useMemo(
    () => ({ itemVisiblePercentThreshold: 88 } as const),
    []
  );

  const onSlotLayout = React.useCallback((e: LayoutChangeEvent) => {
    const h = Math.floor(e.nativeEvent.layout.height);
    if (h > 0) setSlotHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
  }, []);

  const onViewableItemsChanged = React.useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const id =
        viewableItems.find((v) => v.isViewable && v.item != null)?.item &&
        (viewableItems.find((v) => v.isViewable)?.item as LeapVideo | undefined)?.id;
      setActiveVideoId(id ?? null);
    },
    []
  );

  React.useEffect(() => {
    if (videos.length === 0) {
      setActiveVideoId(null);
      return;
    }
    setActiveVideoId((cur) => (cur && videos.some((v) => v.id === cur) ? cur : videos[0].id));
  }, [videos]);

  const confirmDelete = (item: LeapVideo) => {
    if (!user?.uid) return;
    void (async () => {
      setDeletingId(item.id);
      try {
        await deleteOwnedVideo({ videoId: item.id, viewerUid: user.uid });
      } catch (e) {
        showError('Delete failed', e);
      } finally {
        setDeletingId(null);
      }
    })();
  };

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.header}>
          {nav.canGoBack() ? (
            <TouchableOpacity
              onPress={() => nav.goBack()}
              style={styles.backBtn}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.headerLeft}>
            <Brandmark size={36} />
            <View>
              <Text style={styles.headerTitle}>Your Leaps</Text>
              <Text style={styles.headerSub}>Your posts, newest first</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.feedSlot} onLayout={onSlotLayout}>
        {!hydrated ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.moss} />
          </View>
        ) : videos.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No leaps yet</Text>
            <Text style={styles.emptyBody}>Post from Today to fill this feed.</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            style={styles.reelList}
            data={videos}
            keyExtractor={(x) => x.id}
            extraData={`${pageHeight}-${activeVideoId}-${isFocused ? 1 : 0}`}
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            removeClippedSubviews={false}
            initialNumToRender={3}
            maxToRenderPerBatch={4}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            getItemLayout={
              slotHeight > 0 && pageHeight > 40
                ? (_, index) => ({
                    length: pageHeight,
                    offset: pageHeight * index,
                    index,
                  })
                : undefined
            }
            renderItem={({ item }) => (
              <View style={[styles.reelPage, { height: pageHeight }]}>
                <View style={[styles.reelVideoSlot, { bottom: REEL_BOTTOM_SHEET }]}>
                  <FeedPostVideo
                    reel
                    url={item.url}
                    secondaryUrl={item.secondaryUrl}
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

                <View style={[styles.reelSheet, { height: REEL_BOTTOM_SHEET }]}>
                  <View style={styles.reelSheetTop}>
                    <View style={styles.reelAvatar}>
                      <Text style={styles.reelAvatarText}>{item.username[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.reelTextCol}>
                      <Text style={styles.reelUser}>@{item.username}</Text>
                      <Text style={styles.reelPrompt} numberOfLines={2}>
                        {item.prompt}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => confirmDelete(item)}
                      disabled={deletingId === item.id}
                      hitSlop={8}
                    >
                      <Text style={styles.deleteLink}>{deletingId === item.id ? '…' : 'Delete'}</Text>
                    </TouchableOpacity>
                  </View>
                  {user?.uid && item.id === activeVideoId ? (
                    <ScrollView
                      ref={(r) => {
                        engagementScrollRefs.current[item.id] = r;
                      }}
                      style={styles.reelEngagementScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      <FeedPostEngagement
                        videoId={item.id}
                        videoOwnerUid={item.ownerUid}
                        videoOwnerUsername={item.username}
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
                  ) : user?.uid ? (
                    <View style={styles.reelEngagementPlaceholder}>
                      <Text style={styles.reelEngagementPlaceholderText}>
                        Swipe to another leap — comments and share load on the clip in view.
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 12 },
  headerWrap: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    gap: 4,
  },
  backBtn: { paddingVertical: 6, paddingRight: 4, marginRight: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: colors.text },
  headerSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.muted },
  feedSlot: { flex: 1, minHeight: 0 },
  reelList: { flex: 1 },
  reelPage: { width: '100%', backgroundColor: colors.bg },
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
  deleteLink: { fontSize: 13, fontWeight: '800', color: colors.coral },
  reelEngagementScroll: {
    flex: 1,
    minHeight: 0,
  },
  reelEngagementPlaceholder: {
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  reelEngagementPlaceholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, paddingTop: 48, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  emptyBody: { marginTop: 8, fontSize: 15, fontWeight: '600', color: colors.muted },
});

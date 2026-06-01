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
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { FeedCameraRollSaveBanner } from '../components/FeedCameraRollSaveBanner';
import { FeedPreviewChoice } from '../components/FeedPreviewChoice';
import { TakeTheLeapGate } from '../components/TakeTheLeapGate';
import { UsernameLink } from '../components/UsernameLink';
import { Brandmark } from '../components/Brandmark';
import { FollowButton } from '../components/FollowButton';
import { FeedPostEngagement } from '../components/FeedPostEngagement';
import { FeedPostVideo } from '../components/FeedPostVideo';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { logEngagementScrollingThrottled } from '../services/nativeAnalytics';
import { staffNullVideo } from '../services/nullVideo';
import { navigateToRecord } from '../navigation/navigationHelpers';
import { useAppState } from '../state/appState';
import { takeCameraRollSaveOffer } from '../state/pendingCameraRollSave';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { todayVideoDocId } from '../state/posting';
import { showError } from '../utils/ui';
import {
  markAllNotificationsRead,
  subscribeFollowing,
  subscribeNotifications,
  type FollowingRow,
} from '../services/social';
import { setAppBadgeCount } from '../services/pushNotifications';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { FEED_PREVIEW_SCROLL_LIMIT } from '../constants/feedPreview';
import {
  clearFeedPreviewConsumed,
  loadFeedPreviewConsumed,
  persistFeedPreviewConsumed,
} from '../state/feedPreviewLock';
import {
  challengeDateKeysForFirestoreIn,
  computeFeedViewingFromNow,
  groupDayKeysForFirestoreInQuery,
  normalizeNyDateKey,
  nyDateKey,
  nyDateKeyToSortUtcMs,
  nyLeapDayChainBackward,
  prevNyDateKey,
} from '../utils/nyTime';

type FeedVideo = {
  id: string;
  username: string;
  prompt: string;
  url: string;
  /** Companion PIP clip for BeReal-style dual-camera posts (absent on solo clips). */
  secondaryUrl?: string;
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
/** Prior days use {@link nyLeapDayChainBackward} → {@link prevNyDateKey} — **same stepping as streaks** (one NY calendar day per step). */
const FEED_DAY_WINDOW = 14;
/** Per batched query (several days) — newest first via `orderBy('createdAt')`. */
const FEED_APPROVED_PER_BATCH_LIMIT = 80;
const FEED_HYDRATE_SAFETY_MS = 8_000;

/** Must be a stable reference — `viewabilityConfigCallbackPairs` cannot change after mount (RN FlatList). */
const FEED_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 70,
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
  const { clearPostedOverride, hasPostedToday: canViewEveryoneFeed } = useAppState();
  const { user } = useAuth();
  const feedPreviewMode = Boolean(user?.uid && !canViewEveryoneFeed);
  /** Preview used or skipped for this challenge day — gate only, persisted across restarts. */
  const [feedPreviewConsumed, setFeedPreviewConsumed] = React.useState(false);
  /** User chose "Preview 3 leaps" this visit (resets when leaving feed until consumed). */
  const [feedPreviewSessionActive, setFeedPreviewSessionActive] = React.useState(false);
  /** False until AsyncStorage is read so we do not flash the feed after a prior consume. */
  const [feedPreviewLockHydrated, setFeedPreviewLockHydrated] = React.useState(!feedPreviewMode);

  /**
   * NY calendar day for queries — not `useChallengeWindow()` (that ticked 250ms and re-rendered this whole screen constantly).
   * Poll lightly so we still roll over after midnight without starving the JS thread.
   */
  const [nyCalendarDay, setNyCalendarDay] = React.useState(() => nyDateKey());
  React.useEffect(() => {
    const id = setInterval(() => {
      const next = nyDateKey();
      setNyCalendarDay((prev) => (prev === next ? prev : next));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  /**
   * Leap cycle can change at **noon ET** while the NY calendar day stays the same — `nyCalendarDay`
   * alone would miss that and leave listeners / query `in` lists on the wrong cycle until midnight.
   */
  const [viewingChallengeDateKey, setViewingChallengeDateKey] = React.useState(
    () => computeFeedViewingFromNow(Date.now()).viewingChallengeDateKey
  );
  React.useEffect(() => {
    const tick = () => {
      const next = computeFeedViewingFromNow(Date.now()).viewingChallengeDateKey;
      setViewingChallengeDateKey((prev) => (prev === next ? prev : next));
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  const persistPreviewConsumedForDay = React.useCallback(() => {
    if (user?.uid) {
      void persistFeedPreviewConsumed(user.uid, viewingChallengeDateKey);
    }
  }, [user?.uid, viewingChallengeDateKey]);

  /** Skip for the day — gate only from here on. */
  const markFeedPreviewConsumed = React.useCallback(() => {
    setFeedPreviewConsumed(true);
    setFeedPreviewSessionActive(false);
    persistPreviewConsumedForDay();
  }, [persistPreviewConsumedForDay]);

  /** Tap "Preview" — burns the one daily preview immediately; reels only for this visit. */
  const startFeedPreviewSession = React.useCallback(() => {
    setFeedPreviewConsumed(true);
    setFeedPreviewSessionActive(true);
    persistPreviewConsumedForDay();
  }, [persistPreviewConsumedForDay]);

  const endFeedPreviewSession = React.useCallback(() => {
    setFeedPreviewSessionActive(false);
  }, []);

  React.useEffect(() => {
    if (!feedPreviewMode || !user?.uid) {
      setFeedPreviewConsumed(false);
      setFeedPreviewSessionActive(false);
      setFeedPreviewLockHydrated(true);
      return;
    }
    let cancelled = false;
    setFeedPreviewLockHydrated(false);
    void loadFeedPreviewConsumed(user.uid, viewingChallengeDateKey).then((consumed) => {
      if (cancelled) return;
      setFeedPreviewConsumed(consumed);
      setFeedPreviewSessionActive(false);
      setFeedPreviewLockHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [feedPreviewMode, user?.uid, viewingChallengeDateKey]);

  React.useEffect(() => {
    if (!canViewEveryoneFeed || !user?.uid) return;
    setFeedPreviewConsumed(false);
    setFeedPreviewSessionActive(false);
    void clearFeedPreviewConsumed(user.uid, viewingChallengeDateKey);
  }, [canViewEveryoneFeed, user?.uid, viewingChallengeDateKey]);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        if (!feedPreviewMode) return;
        setFeedPreviewSessionActive(false);
      };
    }, [feedPreviewMode])
  );

  React.useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, []);
  const [videos, setVideos] = React.useState<FeedVideo[]>([]);
  /** False until auth is ready and we have had at least one merge from Firestore listeners. */
  const [feedHydrated, setFeedHydrated] = React.useState(false);
  const [followingRows, setFollowingRows] = React.useState<FollowingRow[]>([]);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [nullingId, setNullingId] = React.useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = React.useState(0);
  const [cameraRollSaveUri, setCameraRollSaveUri] = React.useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const uri = takeCameraRollSaveOffer();
      if (uri) setCameraRollSaveUri(uri);
    }, [])
  );
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  /** Lifts the reel bottom sheet above the keyboard (fixed-height KAV was ineffective here). */
  const [keyboardSheetBottom, setKeyboardSheetBottom] = React.useState(0);
  const flatListRef = React.useRef<FlatList<FeedVideo>>(null);
  /** Measured bottom-sheet height per video so the video slot clears the sheet without extra whitespace. */
  const [reelSheetHeights, setReelSheetHeights] = React.useState<Record<string, number>>({});
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

  const scrollTopThreshold = Math.max(800, pageHeight * 2.2);
  const maxFeedPreviewOffset = React.useMemo(
    () => Math.max(0, (FEED_PREVIEW_SCROLL_LIMIT - 1) * pageHeight),
    [pageHeight]
  );

  const onFeedScroll = React.useCallback(
    (e: any) => {
      const y = Number(e?.nativeEvent?.contentOffset?.y ?? 0);
      logEngagementScrollingThrottled();
      const on = y >= scrollTopThreshold;
      setShowScrollTop((prev) => (prev === on ? prev : on));

      if (
        feedPreviewMode &&
        feedPreviewSessionActive &&
        pageHeight > 40 &&
        y > maxFeedPreviewOffset + pageHeight * 0.12
      ) {
        flatListRef.current?.scrollToOffset({ offset: maxFeedPreviewOffset, animated: true });
        endFeedPreviewSession();
      }
    },
    [
      scrollTopThreshold,
      feedPreviewMode,
      feedPreviewSessionActive,
      pageHeight,
      maxFeedPreviewOffset,
      endFeedPreviewSession,
    ]
  );

  const previousChallengeDateKey = React.useMemo(
    () => prevNyDateKey(viewingChallengeDateKey),
    [viewingChallengeDateKey]
  );

  const onReelSheetLayoutFor = React.useCallback((videoId: string) => (e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h < 48) return;
    setReelSheetHeights((prev) => (prev[videoId] === h ? prev : { ...prev, [videoId]: h }));
  }, []);

  const displayVideos = React.useMemo(() => {
    let v = videos;
    if (preferences.feedType === 'friends' && user?.uid) {
      const fu = new Set(followingRows.map((f) => f.targetUid));
      v = v.filter((item) => item.ownerUid === user.uid || fu.has(item.ownerUid));
    }
    v = v.filter((item) => !preferences.blockedUsernames.includes(item.username));
    v = v.filter((item) => !preferences.mutedUsernames.includes(item.username));
    v = v.filter((item) => !preferences.hiddenVideoIds.includes(item.id));
    if (feedPreviewMode) {
      v = v.slice(0, FEED_PREVIEW_SCROLL_LIMIT);
    }
    return v;
  }, [
    videos,
    preferences.feedType,
    preferences.blockedUsernames,
    preferences.mutedUsernames,
    preferences.hiddenVideoIds,
    user?.uid,
    followingRows,
    feedPreviewMode,
  ]);

  const scrollToTop = React.useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    const firstId = displayVideos[0]?.id;
    if (firstId) setActiveVideoId(firstId);
  }, [displayVideos]);

  /** First reel for the immediate prior leap day (T−1) — do not jump to older days. */
  const firstPreviousLeapsIndex = React.useMemo(
    () => displayVideos.findIndex((v) => v.challengeDate === previousChallengeDateKey),
    [displayVideos, previousChallengeDateKey]
  );

  const flatListExtraData = React.useMemo(
    () => ({
      pageHeight,
      activeVideoId,
      feedHydrated,
      focused: isFocused ? 1 : 0,
      reelSheetHeights,
    }),
    [pageHeight, activeVideoId, feedHydrated, isFocused, reelSheetHeights]
  );

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
    return subscribeNotifications(user?.uid, (rows) => {
      const n = rows.filter((r) => !r.read).length;
      setUnreadNotifications(n);
      void setAppBadgeCount(n);
    });
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
  }, [nyCalendarDay, viewingChallengeDateKey]);

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
    if (!user?.uid || (!canViewEveryoneFeed && !feedPreviewMode)) {
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
  }, [user?.uid, canViewEveryoneFeed, feedPreviewMode, feedHydrated, pageHeight, displayVideos]);

  const canStaffMod = Boolean(user?.isAdmin || user?.isModerator);

  const confirmStaffNull = (item: FeedVideo) => {
    if (!canStaffMod || !user?.uid || item.ownerUid === user.uid) return;
    if (item.moderationStatus === 'nulled') return;
    Alert.alert(
      'Null this leap?',
      'Removes inches for this video. Streak is not reverted. Only use for policy violations.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Null video',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              setNullingId(item.id);
              try {
                await staffNullVideo(item.id);
              } catch (e) {
                showError('Null failed', e);
              } finally {
                setNullingId(null);
              }
            })(),
        },
      ]
    );
  };

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
    if (!isFirebaseConfigured() || !user?.uid) {
      setVideos([]);
      setFeedHydrated(true);
      return;
    }

    setFeedHydrated(false);
    let cancelled = false;
    let approvedUnsubs: (() => void)[] = [];
    let mineUnsub: (() => void) | null = null;
    /** One bucket per batched Firestore query (few listeners instead of one per day). */
    let approvedDocsByBatch: FeedVideo[][] = [];
    let mineDocs: FeedVideo[] = [];
    let approvedListenersDone = false;
    let mineListenerSeen = false;

    const bumpHydrated = () => {
      if (cancelled) return;
      const hasPosts =
        mineDocs.length > 0 || approvedDocsByBatch.some((batch) => batch.length > 0);
      if (hasPosts || (approvedListenersDone && mineListenerSeen)) {
        setFeedHydrated(true);
      }
    };

    const merge = () => {
      const map = new Map<string, FeedVideo>();
      const approvedFlat = approvedDocsByBatch.flat();
      for (const v of [...mineDocs, ...approvedFlat]) {
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
      if (merged.length > 0) bumpHydrated();
    };

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setFeedHydrated(true);
    }, FEED_HYDRATE_SAFETY_MS);

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (cancelled) return;

        const calToday = nyDateKey();
        const anchorKey = normalizeNyDateKey(viewingChallengeDateKey, calToday);
        /** Same backward chain as Me streak — no skipped calendar dates; legacy `noon−40h` caused both bugs. */
        const leapChain = nyLeapDayChainBackward(anchorKey, FEED_DAY_WINDOW);
        /**
         * Between NY **midnight and noon**, `nyDateKey()` (calendar “today”) is **one day ahead** of the
         * noon→noon leap key (`anchorKey`). Some `videos.challengeDate` values follow the calendar day
         * (same as TopScreen daily filter); without including `calToday` here those clips are absent until
         * Eastern noon when leap and calendar align.
         */
        const calNorm = normalizeNyDateKey(calToday, calToday);
        const dayChain =
          calNorm && calNorm !== anchorKey ? [calNorm, ...leapChain] : leapChain;
        const dayGroups = groupDayKeysForFirestoreInQuery(dayChain);
        approvedDocsByBatch = dayGroups.map(() => []);

        const docToFeedVideo = (d: QueryDocumentSnapshot): FeedVideo => {
          const data: any = d.data();
          const createdAtMs =
            typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
          const rawCd = data?.challengeDate;
          const cdRaw =
            rawCd && typeof (rawCd as { toDate?: () => Date }).toDate === 'function'
              ? nyDateKey((rawCd as { toDate: () => Date }).toDate())
              : String(rawCd ?? '');
          const challengeDate = normalizeNyDateKey(cdRaw, viewingChallengeDateKey);
          const secondaryUrlRaw = String(data?.secondaryUrl ?? '').trim();
          return {
            id: d.id,
            username: String(data?.username ?? 'user'),
            prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
            url: String(data?.url ?? ''),
            ...(secondaryUrlRaw ? { secondaryUrl: secondaryUrlRaw } : {}),
            createdAtMs,
            ownerUid: String(data?.uid ?? ''),
            moderationStatus: String(data?.moderationStatus ?? 'approved'),
            maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
            challengeDate,
          };
        };

        const segmentSeen = dayGroups.map(() => false);
        const markApprovedReady = () => {
          approvedListenersDone = segmentSeen.length === 0 || segmentSeen.every(Boolean);
          bumpHydrated();
        };

        if (dayGroups.length === 0) {
          approvedListenersDone = true;
          markApprovedReady();
        } else {
          approvedUnsubs = dayGroups.map((group, idx) => {
            const inVals = challengeDateKeysForFirestoreIn(group);
            if (inVals.length === 0) {
              segmentSeen[idx] = true;
              approvedDocsByBatch[idx] = [];
              merge();
              markApprovedReady();
              return () => {};
            }
            const approvedQ = query(
              collection(firestore(), 'videos'),
              where('challengeDate', 'in', inVals),
              where('moderationStatus', '==', 'approved'),
              orderBy('createdAt', 'desc'),
              limit(FEED_APPROVED_PER_BATCH_LIMIT)
            );
            return onSnapshot(
              approvedQ,
              (snap) => {
                approvedDocsByBatch[idx] = snap.docs.map(docToFeedVideo);
                merge();
                segmentSeen[idx] = true;
                markApprovedReady();
              },
              () => {
                approvedDocsByBatch[idx] = [];
                merge();
                segmentSeen[idx] = true;
                markApprovedReady();
              }
            );
          });
        }

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
              const mineSecondaryUrl = String(data?.secondaryUrl ?? '').trim();
              mineDocs = [
                {
                  id: snap.id,
                  username: String(data?.username ?? 'user'),
                  prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
                  url: String(data?.url ?? ''),
                  ...(mineSecondaryUrl ? { secondaryUrl: mineSecondaryUrl } : {}),
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
      for (const u of approvedUnsubs) u();
      mineUnsub?.();
    };
  }, [nyCalendarDay, viewingChallengeDateKey, user?.uid]);

  if (!user?.uid) {
    return <TakeTheLeapGate variant="feed" />;
  }

  const showFeedPreviewChoice =
    feedPreviewMode &&
    feedPreviewLockHydrated &&
    !feedPreviewConsumed &&
    !feedPreviewSessionActive;

  const previewVideosReady = feedHydrated && displayVideos.length > 0;

  if (feedPreviewMode && !feedPreviewLockHydrated) {
    return (
      <Screen style={styles.feedScreen}>
        <View style={styles.previewLockLoading}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </Screen>
    );
  }

  if (feedPreviewMode && feedPreviewConsumed && !feedPreviewSessionActive) {
    return <TakeTheLeapGate variant="feed" />;
  }

  if (showFeedPreviewChoice) {
    return (
      <FeedPreviewChoice
        previewDisabled={!previewVideosReady}
        onPreview={startFeedPreviewSession}
        onSkip={markFeedPreviewConsumed}
      />
    );
  }

  if (feedPreviewMode && feedPreviewSessionActive && feedHydrated && displayVideos.length === 0) {
    return <TakeTheLeapGate variant="feed" />;
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
                onPress={() => {
                  if (user?.uid) {
                    void markAllNotificationsRead(user.uid).then(() => {
                      setUnreadNotifications(0);
                      void setAppBadgeCount(0);
                    });
                  }
                  nav.navigate('Notifications');
                }}
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

      {cameraRollSaveUri ? (
        <FeedCameraRollSaveBanner
          clipUri={cameraRollSaveUri}
          onDismiss={() => setCameraRollSaveUri(null)}
        />
      ) : null}

      {feedPreviewMode ? (
        <View style={styles.previewBanner} pointerEvents="none">
          <Text style={styles.previewBannerText}>
            Preview — swipe up to {FEED_PREVIEW_SCROLL_LIMIT} leaps, then take yours to unlock the feed
          </Text>
        </View>
      ) : null}

      <View ref={feedSlotRef} style={styles.feedSlot} onLayout={onSlotLayout} collapsable={false}>
        <FlatList
          ref={flatListRef}
          style={styles.reelList}
          data={displayVideos}
          keyExtractor={(x) => x.id}
          extraData={flatListExtraData}
          viewabilityConfig={FEED_VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          onScroll={onFeedScroll}
          scrollEventThrottle={16}
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
          renderItem={({ item, index }) => {
            const sheetBottom = reelSheetHeights[item.id] ?? REEL_BOTTOM_SHEET;
            const showPreviousLeapsChip =
              activeVideoId === item.id &&
              firstPreviousLeapsIndex >= 0 &&
              index === firstPreviousLeapsIndex;
            return (
            <View style={[styles.reelPage, { height: pageHeight }]}>
              <View style={[styles.reelVideoSlot, { bottom: sheetBottom }]}>
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
                  viewerUsername={user?.username}
                  onReelActivate={() => setActiveVideoId(item.id)}
                />
              </View>

              <View
                style={[
                  styles.reelSheet,
                  keyboardSheetBottom > 0 ? { bottom: keyboardSheetBottom } : undefined,
                ]}
                onLayout={onReelSheetLayoutFor(item.id)}
              >
                <View style={styles.reelSheetTop}>
                  <View style={styles.reelAvatar}>
                    <Text style={styles.reelAvatarText}>{item.username[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={styles.reelTextCol}>
                    <UsernameLink uid={item.ownerUid} username={item.username} style={styles.reelUser} />
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
                    {canStaffMod && item.ownerUid !== user?.uid ? (
                      item.moderationStatus === 'nulled' ? (
                        <Text style={styles.nulledBadge}>Nulled</Text>
                      ) : item.moderationStatus === 'approved' ? (
                        <TouchableOpacity
                          onPress={() => confirmStaffNull(item)}
                          disabled={nullingId === item.id}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Null this leap"
                        >
                          <Text style={styles.nullLink}>
                            {nullingId === item.id ? '…' : 'Null'}
                          </Text>
                        </TouchableOpacity>
                      ) : null
                    ) : null}
                    {user?.uid && item.ownerUid === user.uid ? (
                      <TouchableOpacity
                        onPress={() => confirmDelete(item)}
                        disabled={deletingId === item.id}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Delete video"
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
                {displayVideos.length > 1 ? (
                  <View style={styles.reelSwipeRail} pointerEvents="none">
                    <Ionicons name="chevron-down" size={13} color={colors.muted} />
                    <Text style={styles.reelSwipeRailText}>Swipe for more leaps</Text>
                    <Ionicons name="chevron-down" size={13} color={colors.muted} />
                  </View>
                ) : null}
              </View>
              {showPreviousLeapsChip ? (
                <View style={[styles.previousLeapsChip, { bottom: sheetBottom + 12 }]} pointerEvents="none">
                  <Ionicons name="calendar-outline" size={15} color={colors.moss} />
                  <Text style={styles.previousLeapsChipText}>Previous leaps</Text>
                </View>
              ) : null}
            </View>
            );
          }}
        />
        {showScrollTop ? (
          <TouchableOpacity
            style={styles.scrollTopFab}
            onPress={scrollToTop}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Scroll to top"
          >
            <View style={styles.scrollTopFrog}>
              <View style={styles.scrollTopFrogBody}>
                <View style={styles.scrollTopFrogBelly} />
                <View style={styles.scrollTopFrogEyes}>
                  <View style={styles.scrollTopFrogEye}>
                    <View style={styles.scrollTopFrogPupil} />
                  </View>
                  <View style={styles.scrollTopFrogEye}>
                    <View style={styles.scrollTopFrogPupil} />
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 12,
  },
  previewBanner: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: '#E6F4D7',
  },
  previewBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 17,
  },
  feedScreen: {
    flex: 1,
  },
  previewLockLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  scrollTopFab: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.moss,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  scrollTopFrog: {
    width: 34,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollTopFrogBody: {
    width: 28,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#5AD98A',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scrollTopFrogBelly: {
    position: 'absolute',
    bottom: 2,
    width: 14,
    height: 10,
    borderRadius: 6,
    backgroundColor: '#A7F3D0',
    opacity: 0.65,
  },
  scrollTopFrogEyes: {
    flexDirection: 'row',
    gap: 6,
    marginTop: -2,
  },
  scrollTopFrogEye: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollTopFrogPupil: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#111827',
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
    alignSelf: 'stretch',
  },
  reelSwipeRail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 6,
    paddingBottom: 2,
    opacity: 0.85,
  },
  reelSwipeRailText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.muted,
    letterSpacing: 0.3,
  },
  previousLeapsChip: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 24,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(45, 90, 61, 0.25)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  previousLeapsChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.moss,
    letterSpacing: 0.4,
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
  nullLink: {
    fontSize: 13,
    fontWeight: '800',
    color: '#C0392B',
    paddingTop: 2,
  },
  nulledBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.muted,
    letterSpacing: 0.4,
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
});


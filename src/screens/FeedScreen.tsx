import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  LayoutChangeEvent,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import {
  doc,
  onSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { patchAudioMode } from '../camera/audioSessionGate';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

import { FeedCameraRollSaveBanner } from '../components/FeedCameraRollSaveBanner';
import { FeedGraduationMoment } from '../components/FeedGraduationMoment';
import { FeedPreviewChoice } from '../components/FeedPreviewChoice';
import { FeedLastLeapJumpChip } from '../components/FeedLastLeapJumpChip';
import { FeedSinceLastLeapBanner } from '../components/FeedSinceLastLeapBanner';
import { FeedTier1ExploreBanner } from '../components/FeedTier1ExploreBanner';
import { FeedTeaserWallBar } from '../components/FeedTeaserWallBar';
import { TakeTheLeapGate } from '../components/TakeTheLeapGate';
import { FeedReelRow } from '../components/FeedReelRow';
import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { ModernFeedModeSwitch } from '../components/modern/ModernFeedModeSwitch';
import { BestPartScreen } from './BestPartScreen';
import { deleteOwnedVideo } from '../services/deleteVideo';
import { logEngagementScrollingThrottled, logExperimentEvent } from '../services/nativeAnalytics';
import { staffNullVideo } from '../services/nullVideo';
import { navigateToRecord } from '../navigation/navigationHelpers';
import type { TabsParamList } from '../navigation/Tabs';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';
import { useAppState } from '../state/appState';
import { takeCameraRollSaveOffer, type CameraRollSaveOffer } from '../state/pendingCameraRollSave';
import { normalizeTaskDurationSeconds } from '../state/challenge';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from '../state/auth';
import { markFeedGraduationSeen, useFeedGraduationSeen } from '../state/feedGraduation';
import {
  FEED_GATE_V2,
  TIER2_CARD_LOCKS_ENABLED,
  isAtTier1Wall,
  isTier2CardLocked,
  shouldShowLastLeapJumpChip,
  tier2LastLeapJumpIndex,
  resolveFeedGateTier,
  tier1MaxScrollOffset,
} from '../state/feedGate';
import { useFeedTeaserCardLimit } from '../state/feedTeaserLimit';
import { useHasPostedAnyVideo, todayVideoDocId } from '../state/posting';
import { useLeapsSinceLastPostCount } from '../hooks/useLeapsSinceLastPostCount';
import { useUserPostedDates } from '../hooks/useUserPostedDates';
import { showError } from '../utils/ui';
import {
  subscribeFollowing,
  type FollowingRow,
} from '../services/social';
import { isHiddenCoLeapCreditDoc, parseCoLeapInvitees } from '../lib/coLeapInvitees';
import { useSettingsPreferences } from '../state/settingsPreferences';
import { FEED_PREVIEW_SCROLL_LIMIT } from '../constants/feedPreview';
import {
  clearFeedPreviewConsumed,
  loadFeedPreviewConsumed,
  loadFeedPreviewStarted,
  persistFeedPreviewConsumed,
  persistFeedPreviewStarted,
} from '../state/feedPreviewLock';
import {
  computeFeedViewingFromNow,
  normalizeNyDateKey,
  nyDateKey,
  nyDateKeyToSortUtcMs,
  nyLeapDayChainBackward,
  prevNyDateKey,
} from '../utils/nyTime';
import {
  fetchFirstApprovedFeedPage,
  fetchNewerApprovedFeedSince,
  fetchNextApprovedFeedPage,
  type FeedApprovedPageCursor,
} from '../lib/feedApprovedPagination';
import { shareReferralInvite } from '../utils/shareReferralInvite';
import {
  loadReferralNudgeShownForDay,
  persistReferralNudgeShownForDay,
} from '../state/referralNudgeDay';
import { resolveFeedPlaybackUrls } from '../lib/feedPlaybackUrls';
import { useBackgroundPostUpload } from '../state/backgroundPostUpload';

/**
 * Keep active ±1 mounted so the paging swipe stays painted (TikTok-style).
 * 720p feed files are small enough that neighbor warm no longer starves playback.
 */
const FEED_PRELOAD_BEHIND = 1;
const FEED_PRELOAD_AHEAD = 1;

type FeedVideo = {
  id: string;
  username: string;
  prompt: string;
  url: string;
  /** Companion PIP clip for BeReal-style dual-camera posts (absent on solo clips). */
  secondaryUrl?: string;
  /** Faststart / 720p feed URLs when Cloud Function has finished. */
  feedUrl?: string;
  feedSecondaryUrl?: string;
  /** First-frame JPEG for seamless paint before the decoder is ready. */
  posterUrl?: string;
  /** When true on dual posts, audio lives on the PIP clip because front was the big view. */
  dualFrontIsPrimary?: boolean;
  /** Proof / camera-roll leaps may be still photos. */
  mediaType?: 'video' | 'photo';
  createdAtMs: number;
  ownerUid: string;
  moderationStatus: string;
  maxDurationSeconds: number;
  /** NY calendar day for this post (`videos.challengeDate`). */
  challengeDate: string;
  likesCount: number;
  commentsCount: number;
  /** Co-Leap invitees on the source post (credit docs are hidden from feed). */
  coLeapInvitees?: Array<{ uid: string; username: string; status: 'pending' | 'confirmed' }>;
};

/** Bottom sheet height (instructions + engagement) per reel page — matches Tabs tab bar feel. */
const REEL_BOTTOM_SHEET = 232;
/** Prior days use {@link nyLeapDayChainBackward} → {@link prevNyDateKey} — **same stepping as streaks** (one NY calendar day per step). */
const FEED_DAY_WINDOW = 14;
const FEED_HYDRATE_SAFETY_MS = 4_000;
/** Bottom offset stack for last-leap chip above tab bar (chip height + padding). */
const LAST_LEAP_JUMP_CHIP_STACK = 38;

/** Same visibility rules as the feed FlatList data (friends / block / mute / hidden; no preview slice). */
function filterFeedVideosForViewer(
  items: readonly FeedVideo[],
  opts: {
    viewerUid?: string;
    feedType: string;
    followingTargetUids: ReadonlySet<string>;
    blockedUsernames: ReadonlySet<string>;
    mutedUsernames: ReadonlySet<string>;
    hiddenVideoIds: ReadonlySet<string>;
  }
): FeedVideo[] {
  let v = items.filter((item) => Boolean(item.url));
  if (opts.feedType === 'friends' && opts.viewerUid) {
    v = v.filter(
      (item) => item.ownerUid === opts.viewerUid || opts.followingTargetUids.has(item.ownerUid)
    );
  }
  v = v.filter((item) => !opts.blockedUsernames.has(item.username));
  v = v.filter((item) => !opts.mutedUsernames.has(item.username));
  v = v.filter((item) => !opts.hiddenVideoIds.has(item.id));
  return v;
}

/** Must be a stable reference — `viewabilityConfigCallbackPairs` cannot change after mount (RN FlatList). */
const FEED_VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 1,
  waitForInteraction: false,
} as const;

/** Fields that affect reel playback / row UI — ignore engagement-only doc churn (viewCount, likesCount, …). */
function feedVideoRowKey(v: FeedVideo): string {
  return [
    v.id,
    v.url,
    v.secondaryUrl ?? '',
    v.feedUrl ?? '',
    v.feedSecondaryUrl ?? '',
    v.posterUrl ?? '',
    v.dualFrontIsPrimary ? '1' : '0',
    v.mediaType === 'photo' ? 'photo' : 'video',
    v.maxDurationSeconds,
    v.moderationStatus,
    v.challengeDate,
    v.prompt,
    v.username,
    v.ownerUid,
    v.createdAtMs,
    (v.coLeapInvitees ?? []).map((i) => `${i.uid}:${i.status}`).join(','),
  ].join('|');
}

function feedVideosRowEqual(a: readonly FeedVideo[], b: readonly FeedVideo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (feedVideoRowKey(a[i]) !== feedVideoRowKey(b[i])) return false;
  }
  return true;
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

export function FeedScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
  screen: {
    paddingHorizontal: 12,
  },
  feedBannerStack: {
    position: 'absolute',
    top: 108,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: 6,
    gap: 6,
  },
  previewBanner: {
    marginHorizontal: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.profileAccentBorder,
  },
  referralNudge: {
    marginHorizontal: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  referralNudgeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 18,
  },
  referralNudgeLink: {
    fontWeight: '800',
    color: colors.moss,
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
    backgroundColor: '#101411',
  },
  previewLockLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeSwitch: {
    position: 'absolute',
    top: 8,
    left: '50%',
    width: 290,
    transform: [{ translateX: -145 }],
    zIndex: 25,
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
    backgroundColor: colors.card,
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
    backgroundColor: colors.card,
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
  reelEngagementPlaceholder: {
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
    backgroundColor: colors.card,
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
  pendingBadge: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.moss,
    letterSpacing: 0.3,
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
}));
  const isFocused = useIsFocused();
  const nav = useNavigation<any>();
  const route = useRoute<RouteProp<TabsParamList, 'Feed'>>();
  const [feedMode, setFeedMode] = React.useState<'daily' | 'bpotd'>(
    () => route.params?.mode ?? 'daily'
  );
  React.useEffect(() => {
    setFeedMode(route.params?.mode ?? 'daily');
  }, [route.params?.mode]);
  const { preferences } = useSettingsPreferences();
  const { clearPostedOverride, hasPostedToday } = useAppState();
  const { pendingFeedPlayback, clearPendingFeedPlayback } = useBackgroundPostUpload();
  const { user } = useAuth();
  const isStaffUser = Boolean(user?.isAdmin || user?.isModerator);
  /** Review demo, experiment `gate_off`, or full gate kill-switch — unlocked playable feed. */
  /** Review demo OR experiment `gate_off` — fully unlocked feed (no teaser wall / tier-2 locks). */
  const bypassFeedGate =
    Boolean(user?.bypassFeedGate) || user?.experimentCohort === 'gate_off';
  const canViewEveryoneFeed = hasPostedToday || bypassFeedGate;
  /** Legacy daily preview gate — dormant when {@link FEED_GATE_V2}. */
  const feedPreviewMode = !FEED_GATE_V2 && Boolean(user?.uid && !canViewEveryoneFeed);

  const { hasEverPosted, hasEverPostedHydrated } = useHasPostedAnyVideo(user?.uid);
  const gateTierResolved = hasEverPostedHydrated
    ? resolveFeedGateTier(hasEverPosted)
    : null;
  const isTier1Teaser =
    FEED_GATE_V2 && gateTierResolved === 'tier1_teaser' && !bypassFeedGate;
  const isTier2Established =
    FEED_GATE_V2 && gateTierResolved === 'tier2_daily' && !bypassFeedGate;

  const { teaserLimit, teaserLimitReady } = useFeedTeaserCardLimit(
    user?.uid,
    isTier1Teaser
  );
  const { postedDates, postedDatesReady, lastPostedDateKey } = useUserPostedDates(user?.uid);
  const { graduationSeen, graduationSeenHydrated } = useFeedGraduationSeen(user?.uid);

  const [activeScrollIndex, setActiveScrollIndex] = React.useState(0);
  const [showGraduation, setShowGraduation] = React.useState(false);
  const [graduationWallDissolving, setGraduationWallDissolving] = React.useState(false);
  const [tier2UnlockAnimating, setTier2UnlockAnimating] = React.useState(false);

  const activeScrollIndexRef = React.useRef(0);
  const everPostedBaselineSetRef = React.useRef(false);
  const prevHasEverPostedRef = React.useRef(false);
  const prevHasPostedTodayRef = React.useRef(hasPostedToday);
  const feedViewedLoggedRef = React.useRef(false);
  const gateShownLoggedRef = React.useRef(false);

  React.useEffect(() => {
    everPostedBaselineSetRef.current = false;
    prevHasEverPostedRef.current = false;
    feedViewedLoggedRef.current = false;
    gateShownLoggedRef.current = false;
  }, [user?.uid]);

  React.useEffect(() => {
    if (!isFocused || !user?.uid || !user.experimentCohort) return;
    if (feedViewedLoggedRef.current) return;
    feedViewedLoggedRef.current = true;
    void logExperimentEvent('feed_viewed');
  }, [isFocused, user?.uid, user?.experimentCohort]);

  React.useEffect(() => {
    if (!isFocused || user?.experimentCohort !== 'gate_on') return;
    if (gateShownLoggedRef.current) return;
    const gateBlocking =
      isTier1Teaser ||
      (isTier2Established && !hasPostedToday) ||
      (!FEED_GATE_V2 && feedPreviewMode);
    if (!gateBlocking) return;
    gateShownLoggedRef.current = true;
    void logExperimentEvent('gate_shown');
  }, [
    isFocused,
    user?.experimentCohort,
    isTier1Teaser,
    isTier2Established,
    hasPostedToday,
    feedPreviewMode,
  ]);

  React.useEffect(() => {
    if (!FEED_GATE_V2 || !user?.uid || !graduationSeenHydrated || !hasEverPostedHydrated) return;

    if (!everPostedBaselineSetRef.current) {
      everPostedBaselineSetRef.current = true;
      prevHasEverPostedRef.current = hasEverPosted;
      if (hasEverPosted && !graduationSeen) {
        void markFeedGraduationSeen(user.uid);
      }
      return;
    }

    if (!prevHasEverPostedRef.current && hasEverPosted && !graduationSeen) {
      setGraduationWallDissolving(isAtTier1Wall(activeScrollIndexRef.current, teaserLimit ?? 15));
      setShowGraduation(true);
    }
    prevHasEverPostedRef.current = hasEverPosted;
  }, [
    hasEverPosted,
    hasEverPostedHydrated,
    graduationSeen,
    graduationSeenHydrated,
    user?.uid,
    teaserLimit,
  ]);

  React.useEffect(() => {
    if (!FEED_GATE_V2 || !isTier2Established) return;
    if (!prevHasPostedTodayRef.current && hasPostedToday) {
      setTier2UnlockAnimating(true);
      const t = setTimeout(() => setTier2UnlockAnimating(false), 620);
      prevHasPostedTodayRef.current = hasPostedToday;
      return () => clearTimeout(t);
    }
    prevHasPostedTodayRef.current = hasPostedToday;
  }, [hasPostedToday, isTier2Established]);

  const dismissGraduation = React.useCallback(() => {
    setShowGraduation(false);
    setGraduationWallDissolving(false);
    if (user?.uid) void markFeedGraduationSeen(user.uid);
  }, [user?.uid]);

  const effectiveTeaserLimit = teaserLimit ?? 15;

  /** Preview skipped or finished for this challenge day — gate only, persisted across restarts. */
  const [feedPreviewConsumed, setFeedPreviewConsumed] = React.useState(false);
  /** User tapped Preview — can resume reels until they skip or finish swiping. */
  const [feedPreviewStarted, setFeedPreviewStarted] = React.useState(false);
  /** Reels are playing on screen (paused when leaving the feed tab). */
  const [feedPreviewSessionActive, setFeedPreviewSessionActive] = React.useState(false);
  /** False until AsyncStorage is read so we do not flash the feed after a prior consume. */
  const [feedPreviewLockHydrated, setFeedPreviewLockHydrated] = React.useState(!feedPreviewMode);
  const [showReferralNudge, setShowReferralNudge] = React.useState(false);
  const [referralNudgeHydrated, setReferralNudgeHydrated] = React.useState(false);

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

  const inviteUsername = preferences.profileUsername || user?.username || '';

  React.useEffect(() => {
    if (!user?.uid) {
      setShowReferralNudge(false);
      setReferralNudgeHydrated(true);
      return;
    }
    let cancelled = false;
    setReferralNudgeHydrated(false);
    void loadReferralNudgeShownForDay(user.uid, viewingChallengeDateKey).then((shown) => {
      if (cancelled) return;
      setReferralNudgeHydrated(true);
      if (!shown) setShowReferralNudge(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, viewingChallengeDateKey]);

  const dismissReferralNudge = React.useCallback(() => {
    setShowReferralNudge(false);
    if (user?.uid) {
      void persistReferralNudgeShownForDay(user.uid, viewingChallengeDateKey);
    }
  }, [user?.uid, viewingChallengeDateKey]);

  React.useEffect(() => {
    if (!showReferralNudge || !user?.uid) return;
    void persistReferralNudgeShownForDay(user.uid, viewingChallengeDateKey);
  }, [showReferralNudge, user?.uid, viewingChallengeDateKey]);

  const persistPreviewConsumedForDay = React.useCallback(() => {
    if (!user?.uid || isStaffUser) return;
    void persistFeedPreviewConsumed(user.uid, viewingChallengeDateKey);
  }, [user?.uid, viewingChallengeDateKey, isStaffUser]);

  /** Skip for the day — gate only from here on. */
  const markFeedPreviewConsumed = React.useCallback(() => {
    setFeedPreviewConsumed(true);
    setFeedPreviewStarted(false);
    setFeedPreviewSessionActive(false);
    persistPreviewConsumedForDay();
  }, [persistPreviewConsumedForDay]);

  /** Tap "Preview" — start (or resume) the one daily preview session. */
  const startFeedPreviewSession = React.useCallback(() => {
    setFeedPreviewStarted(true);
    setFeedPreviewSessionActive(true);
    if (user?.uid && !isStaffUser) {
      void persistFeedPreviewStarted(user.uid, viewingChallengeDateKey);
    }
  }, [user?.uid, viewingChallengeDateKey, isStaffUser]);

  const endFeedPreviewSession = React.useCallback(() => {
    setFeedPreviewConsumed(true);
    setFeedPreviewStarted(false);
    setFeedPreviewSessionActive(false);
    persistPreviewConsumedForDay();
  }, [persistPreviewConsumedForDay]);

  React.useEffect(() => {
    if (!feedPreviewMode || !user?.uid) {
      setFeedPreviewConsumed(false);
      setFeedPreviewStarted(false);
      setFeedPreviewSessionActive(false);
      setFeedPreviewLockHydrated(true);
      return;
    }
    if (isStaffUser) {
      setFeedPreviewConsumed(false);
      setFeedPreviewStarted(false);
      setFeedPreviewSessionActive(false);
      setFeedPreviewLockHydrated(true);
      return;
    }
    let cancelled = false;
    setFeedPreviewLockHydrated(false);
    void Promise.all([
      loadFeedPreviewConsumed(user.uid, viewingChallengeDateKey),
      loadFeedPreviewStarted(user.uid, viewingChallengeDateKey),
    ]).then(([consumed, started]) => {
      if (cancelled) return;
      setFeedPreviewConsumed(consumed);
      setFeedPreviewStarted(consumed ? false : started);
      setFeedPreviewSessionActive(false);
      setFeedPreviewLockHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [feedPreviewMode, user?.uid, viewingChallengeDateKey, isStaffUser]);

  React.useEffect(() => {
    if (!canViewEveryoneFeed || !user?.uid) return;
    setFeedPreviewConsumed(false);
    setFeedPreviewStarted(false);
    setFeedPreviewSessionActive(false);
    void clearFeedPreviewConsumed(user.uid, viewingChallengeDateKey);
  }, [canViewEveryoneFeed, user?.uid, viewingChallengeDateKey]);

  useFocusEffect(
    React.useCallback(() => {
      if (feedPreviewMode && feedPreviewStarted && !feedPreviewConsumed) {
        setFeedPreviewSessionActive(true);
      }
      return () => {
        if (!feedPreviewMode) return;
        setFeedPreviewSessionActive(false);
      };
    }, [feedPreviewMode, feedPreviewStarted, feedPreviewConsumed])
  );

  React.useEffect(() => {
    void patchAudioMode({ playsInSilentModeIOS: true }).catch(() => {
      void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
    });
    return () => {
      void Audio.setIsEnabledAsync(true).catch(() => {});
    };
  }, []);
  const [videos, setVideos] = React.useState<FeedVideo[]>([]);
  /** False until auth is ready and we have had at least one merge from Firestore listeners. */
  const [feedHydrated, setFeedHydrated] = React.useState(false);
  const [followingRows, setFollowingRows] = React.useState<FollowingRow[]>([]);
  const [activeVideoId, setActiveVideoId] = React.useState<string | null>(null);
  /** Gate next-clip warm mount until the active reel is actually ready. */
  const [activeReadyId, setActiveReadyId] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [nullingId, setNullingId] = React.useState<string | null>(null);
  const [cameraRollSaveOffer, setCameraRollSaveOffer] = React.useState<CameraRollSaveOffer | null>(
    null
  );

  useFocusEffect(
    React.useCallback(() => {
      const offer = takeCameraRollSaveOffer();
      if (offer) setCameraRollSaveOffer(offer);
    }, [])
  );
  const [showScrollTop, setShowScrollTop] = React.useState(false);
  /** Measured bottom-sheet height per video so the video slot clears the sheet without extra whitespace. */
  const [reelSheetHeights, setReelSheetHeights] = React.useState<Record<string, number>>({});
  const flatListRef = React.useRef<FlatList<FeedVideo>>(null);
  const displayVideosRef = React.useRef<FeedVideo[]>([]);
  const feedSlotRef = React.useRef<View>(null);
  const loadMoreFeedRef = React.useRef<(() => void) | null>(null);
  const refreshFeedRef = React.useRef<(() => Promise<void>) | null>(null);
  const pollNewerFeedRef = React.useRef<(() => void) | null>(null);
  const canViewEveryoneFeedRef = React.useRef(canViewEveryoneFeed);
  canViewEveryoneFeedRef.current = canViewEveryoneFeed;

  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [slotHeight, setSlotHeight] = React.useState(0);
  const onSlotLayout = React.useCallback((e: LayoutChangeEvent) => {
    const h = Math.floor(e.nativeEvent.layout.height);
    if (h > 0) setSlotHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev));
  }, []);
  const tabBarClearance = floatingTabContentClearance(insets.bottom);
  const pageHeight = React.useMemo(() => {
    if (slotHeight > 0) return slotHeight;
    return Math.max(380, windowHeight - insets.top - 52);
  }, [slotHeight, windowHeight, insets.top]);

  const maxTier1ScrollOffset = React.useMemo(
    () => tier1MaxScrollOffset(effectiveTeaserLimit, pageHeight),
    [effectiveTeaserLimit, pageHeight]
  );

  const showTeaserWallBar =
    isTier1Teaser &&
    teaserLimitReady &&
    effectiveTeaserLimit > 0 &&
    isAtTier1Wall(activeScrollIndex, effectiveTeaserLimit);

  const tier2NeedsPostToUnlock =
    isTier2Established && !hasPostedToday && postedDatesReady;

  /** Soft nudge only while card locks are off — keep feed fully playable. */
  const tier2HasActiveLocks = TIER2_CARD_LOCKS_ENABLED && tier2NeedsPostToUnlock;
  const tier2CardLocksApply =
    TIER2_CARD_LOCKS_ENABLED && isTier2Established && !hasPostedToday;

  const { leapsSinceLastPost, leapsSinceLastPostReady } = useLeapsSinceLastPostCount({
    enabled: tier2NeedsPostToUnlock,
    postedDates,
    viewingChallengeDateKey,
  });

  const showSinceLastLeapBanner = tier2NeedsPostToUnlock && TIER2_CARD_LOCKS_ENABLED;

  const showTier1ExploreBanner =
    isTier1Teaser && teaserLimitReady && !showTeaserWallBar && !graduationWallDissolving;

  const scrollTopThreshold = Math.max(800, pageHeight * 2.2);
  const maxFeedPreviewOffset = React.useMemo(
    () => Math.max(0, (FEED_PREVIEW_SCROLL_LIMIT - 1) * pageHeight),
    [pageHeight]
  );

  const previousChallengeDateKey = React.useMemo(
    () => prevNyDateKey(viewingChallengeDateKey),
    [viewingChallengeDateKey]
  );

  const [feedRefreshing, setFeedRefreshing] = React.useState(false);

  const onPullRefreshFeed = React.useCallback(() => {
    if (!isFirebaseConfigured() || !user?.uid || feedPreviewMode) return;
    setFeedRefreshing(true);
    void (async () => {
      try {
        await refreshFeedRef.current?.();
      } finally {
        setFeedRefreshing(false);
      }
    })();
  }, [user?.uid, feedPreviewMode]);

  const onEndReachedFeed = React.useCallback(() => {
    loadMoreFeedRef.current?.();
  }, []);

  const onReelSheetLayout = React.useCallback((videoId: string, e: LayoutChangeEvent) => {
    const h = Math.ceil(e.nativeEvent.layout.height);
    if (h < 48) return;
    setReelSheetHeights((prev) => (prev[videoId] === h ? prev : { ...prev, [videoId]: h }));
  }, []);

  const followingTargetUids = React.useMemo(
    () => new Set(followingRows.map((f) => f.targetUid)),
    [followingRows]
  );

  const blockedUsernames = React.useMemo(
    () => new Set(preferences.blockedUsernames),
    [preferences.blockedUsernames]
  );
  const mutedUsernames = React.useMemo(
    () => new Set(preferences.mutedUsernames),
    [preferences.mutedUsernames]
  );
  const hiddenVideoIds = React.useMemo(
    () => new Set(preferences.hiddenVideoIds),
    [preferences.hiddenVideoIds]
  );

  const displayVideos = React.useMemo(() => {
    let v = filterFeedVideosForViewer(videos, {
      viewerUid: user?.uid,
      feedType: preferences.feedType,
      followingTargetUids,
      blockedUsernames,
      mutedUsernames,
      hiddenVideoIds,
    });

    if (
      pendingFeedPlayback &&
      user?.uid === pendingFeedPlayback.uid &&
      pendingFeedPlayback.viewingChallengeDateKey === viewingChallengeDateKey
    ) {
      const docId = pendingFeedPlayback.videoDocId;
      if (!v.some((item) => item.id === docId)) {
        const optimistic: FeedVideo = {
          id: docId,
          username: pendingFeedPlayback.username.trim() || 'user',
          prompt: pendingFeedPlayback.challengeTitle,
          url: pendingFeedPlayback.clipUri,
          ...(pendingFeedPlayback.secondaryClipUri
            ? { secondaryUrl: pendingFeedPlayback.secondaryClipUri }
            : {}),
          ...(pendingFeedPlayback.dualFrontIsPrimary ? { dualFrontIsPrimary: true } : {}),
          ...(pendingFeedPlayback.mediaType === 'photo' ? { mediaType: 'photo' as const } : {}),
          createdAtMs: Date.now(),
          ownerUid: pendingFeedPlayback.uid,
          moderationStatus: 'pending',
          maxDurationSeconds: pendingFeedPlayback.maxDurationSeconds,
          challengeDate: viewingChallengeDateKey,
          likesCount: 0,
          commentsCount: 0,
        };
        v = [optimistic, ...v];
      }
    }

    if (feedPreviewMode) {
      v = v.slice(0, FEED_PREVIEW_SCROLL_LIMIT);
    }
    return v;
  }, [
    videos,
    preferences.feedType,
    blockedUsernames,
    mutedUsernames,
    hiddenVideoIds,
    user?.uid,
    followingTargetUids,
    feedPreviewMode,
    pendingFeedPlayback,
    viewingChallengeDateKey,
  ]);

  displayVideosRef.current = displayVideos;

  const onFeedScroll = React.useCallback(
    (e: any) => {
      const y = Number(e?.nativeEvent?.contentOffset?.y ?? 0);
      logEngagementScrollingThrottled();
      const on = y >= scrollTopThreshold;
      setShowScrollTop((prev) => (prev === on ? prev : on));

      // Keep index in a ref during the fling — avoid React re-renders mid-scroll.
      if (pageHeight > 40) {
        activeScrollIndexRef.current = Math.max(0, Math.round(y / pageHeight));
      }

      if (
        isTier1Teaser &&
        teaserLimitReady &&
        pageHeight > 40 &&
        y > maxTier1ScrollOffset + pageHeight * 0.12
      ) {
        // Non-animated: animated clamps have crashed iOS mid-OTA reload
        // (UIScrollViewScrollAnimation → _notifyDidScroll null deref).
        flatListRef.current?.scrollToOffset({ offset: maxTier1ScrollOffset, animated: false });
      }

      if (
        feedPreviewMode &&
        feedPreviewSessionActive &&
        pageHeight > 40 &&
        y > maxFeedPreviewOffset + pageHeight * 0.12
      ) {
        flatListRef.current?.scrollToOffset({ offset: maxFeedPreviewOffset, animated: false });
        endFeedPreviewSession();
      }
    },
    [
      scrollTopThreshold,
      isTier1Teaser,
      teaserLimitReady,
      pageHeight,
      maxTier1ScrollOffset,
      feedPreviewMode,
      feedPreviewSessionActive,
      maxFeedPreviewOffset,
      endFeedPreviewSession,
    ]
  );

  const onFeedMomentumScrollEnd = React.useCallback(
    (e: any) => {
      const y = Number(e?.nativeEvent?.contentOffset?.y ?? 0);
      if (pageHeight <= 40) return;
      const idx = Math.max(0, Math.min(displayVideosRef.current.length - 1, Math.round(y / pageHeight)));
      activeScrollIndexRef.current = idx;
      setActiveScrollIndex((prev) => (prev === idx ? prev : idx));
      const id = displayVideosRef.current[idx]?.id;
      if (id) setActiveVideoId((prev) => (prev === id ? prev : id));
    },
    [pageHeight]
  );

  const scrollToTop = React.useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    const firstId = displayVideos[0]?.id;
    if (firstId) setActiveVideoId(firstId);
  }, [displayVideos]);

  const lastLeapJumpIndex = React.useMemo(
    () =>
      tier2LastLeapJumpIndex({
        videos: displayVideos,
        lastPostedDateKey,
      }),
    [displayVideos, lastPostedDateKey]
  );

  /** Show while still above the last allowed leap day (locked newer content). */
  const activeFeedChallengeDate = displayVideos[activeScrollIndex]?.challengeDate;
  const showLastLeapJump =
    TIER2_CARD_LOCKS_ENABLED &&
    shouldShowLastLeapJumpChip({
      tier2NeedsPostToUnlock,
      lastPostedDateKey,
      lastLeapJumpIndex,
      activeScrollIndex,
      activeChallengeDate: activeFeedChallengeDate,
      hasPostedToday,
      bypassFeedGate,
    });

  const scrollToLastLeap = React.useCallback(() => {
    const jumpIfReady = (): boolean => {
      const list = displayVideosRef.current;
      const idx = tier2LastLeapJumpIndex({
        videos: list,
        lastPostedDateKey,
      });
      if (idx < 0 || pageHeight <= 0) return false;
      flatListRef.current?.scrollToOffset({ offset: idx * pageHeight, animated: true });
      const id = list[idx]?.id;
      if (id) setActiveVideoId(id);
      activeScrollIndexRef.current = idx;
      setActiveScrollIndex(idx);
      return true;
    };

    if (jumpIfReady()) return;

    let attempts = 0;
    const poll = () => {
      if (jumpIfReady() || attempts >= 12) return;
      attempts += 1;
      loadMoreFeedRef.current?.();
      setTimeout(poll, 500);
    };
    loadMoreFeedRef.current?.();
    setTimeout(poll, 500);
  }, [lastPostedDateKey, pageHeight]);

  const lastLeapChipBottom = tabBarClearance + 8;
  const scrollTopFabBottom = showLastLeapJump
    ? tabBarClearance + 8 + LAST_LEAP_JUMP_CHIP_STACK + 8
    : tabBarClearance + 8;

  const activateReelVideo = React.useCallback((videoId: string) => {
    setActiveVideoId(videoId);
  }, []);

  // Hard-silence the audio session while the active reel is a locked tile.
  // Belt-and-suspenders if any native player was left alive from a prior row.
  React.useEffect(() => {
    if (!isFocused || !tier2CardLocksApply) {
      void Audio.setIsEnabledAsync(true).catch(() => {});
      return;
    }
    if (!postedDatesReady) {
      void Audio.setIsEnabledAsync(false).catch(() => {});
      return;
    }
    const active = displayVideos.find((v) => v.id === activeVideoId);
    const locked = active
      ? !lastPostedDateKey ||
        isTier2CardLocked({
          challengeDate: active.challengeDate,
          lastPostedDateKey,
          hasPostedToday: false,
          bypassFeedGate,
        })
      : false;
    void Audio.setIsEnabledAsync(!locked).catch(() => {});
  }, [
    isFocused,
    tier2CardLocksApply,
    postedDatesReady,
    lastPostedDateKey,
    activeVideoId,
    displayVideos,
    bypassFeedGate,
  ]);

  useFocusEffect(
    React.useCallback(() => {
      const list = displayVideosRef.current;
      if (list.length === 0) return;
      const idx = Math.min(list.length - 1, Math.max(0, activeScrollIndexRef.current));
      const id = list[idx]?.id;
      if (id) setActiveVideoId(id);
    }, [])
  );

  /** First reel for the immediate prior leap day (T−1) — do not jump to older days. */
  const firstPreviousLeapsIndex = React.useMemo(
    () => displayVideos.findIndex((v) => v.challengeDate === previousChallengeDateKey),
    [displayVideos, previousChallengeDateKey]
  );

  /** Preload window follows settled active id — avoids mount thrash mid-fling. */
  const activePreloadIndex = React.useMemo(() => {
    if (!activeVideoId) return activeScrollIndex;
    const i = displayVideos.findIndex((v) => v.id === activeVideoId);
    return i >= 0 ? i : activeScrollIndex;
  }, [activeVideoId, displayVideos, activeScrollIndex]);

  // Prefetch nearby posters so the next page never flashes black mid-swipe.
  React.useEffect(() => {
    if (preferences.dataSaver) return;
    for (let d = -1; d <= 2; d += 1) {
      const uri = String(displayVideos[activePreloadIndex + d]?.posterUrl ?? '').trim();
      if (uri) {
        void Image.prefetch(uri).catch(() => {
          /* ignore */
        });
      }
    }
  }, [activePreloadIndex, displayVideos, preferences.dataSaver]);

  const flatListExtraData = React.useMemo(
    () =>
      [
        pageHeight,
        activeVideoId,
        activePreloadIndex,
        preferences.dataSaver ? 1 : 0,
        feedHydrated ? 1 : 0,
        isFocused ? 1 : 0,
        hasPostedToday ? 1 : 0,
        gateTierResolved ?? 'pending',
        tier2UnlockAnimating ? 1 : 0,
        bypassFeedGate ? 1 : 0,
        postedDatesReady ? [...postedDates].sort().join(',') : 'pending',
        lastLeapJumpIndex,
        lastPostedDateKey ?? '',
        firstPreviousLeapsIndex,
      ].join('|'),
    [
      pageHeight,
      activeVideoId,
      activePreloadIndex,
      preferences.dataSaver,
      feedHydrated,
      isFocused,
      hasPostedToday,
      gateTierResolved,
      tier2UnlockAnimating,
      bypassFeedGate,
      postedDatesReady,
      postedDates,
      lastLeapJumpIndex,
      lastPostedDateKey,
      firstPreviousLeapsIndex,
    ]
  );

  React.useEffect(() => {
    return subscribeFollowing(user?.uid, setFollowingRows);
  }, [user?.uid]);

  const onViewableItemsChanged = React.useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
      const next = pickPrimaryViewable(viewableItems);
      if (next?.id) setActiveVideoId(next.id);
      const primary = viewableItems.find((v) => v.isViewable && typeof v.index === 'number');
      if (primary && typeof primary.index === 'number') {
        activeScrollIndexRef.current = primary.index;
        setActiveScrollIndex((prev) => (prev === primary.index ? prev : primary.index!));
      }
    },
    []
  );

  React.useEffect(() => {
    setActiveVideoId(null);
    setActiveReadyId(null);
  }, [nyCalendarDay, viewingChallengeDateKey]);

  React.useEffect(() => {
    activeScrollIndexRef.current = 0;
    if (displayVideos.length === 0) {
      setActiveVideoId(null);
      setActiveReadyId(null);
      return;
    }
    setActiveVideoId((cur) =>
      cur && displayVideos.some((v) => v.id === cur) ? cur : displayVideos[0].id
    );
  }, [displayVideos]);

  React.useEffect(() => {
    // New active reel → revoke warm-next until this one is ready.
    setActiveReadyId((prev) => (prev === activeVideoId ? prev : null));
  }, [activeVideoId]);

  const onActiveReelReady = React.useCallback((videoId: string) => {
    setActiveReadyId((prev) => (prev === videoId ? prev : videoId));
  }, []);

  /** After posting (or first load), reel rows can mount before viewability runs; sync scroll + active id once. */
  const prevFeedNonEmptyCountRef = React.useRef(0);
  React.useEffect(() => {
    if (!user?.uid || (!FEED_GATE_V2 && !canViewEveryoneFeed && !feedPreviewMode)) {
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
    const frame = requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
      if (firstId) setActiveVideoId(firstId);
    });
    return () => cancelAnimationFrame(frame);
  }, [user?.uid, canViewEveryoneFeed, feedPreviewMode, feedHydrated, pageHeight, displayVideos]);

  const canStaffMod = Boolean(user?.isAdmin || user?.isModerator);

  const confirmStaffNull = React.useCallback(
    (item: Pick<FeedVideo, 'id' | 'ownerUid' | 'moderationStatus'>) => {
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
    },
    [canStaffMod, user?.uid]
  );

  const confirmDelete = React.useCallback(
    (item: Pick<FeedVideo, 'id' | 'ownerUid'>) => {
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
                } catch (e) {
                  showError('Delete failed', e);
                } finally {
                  clearPostedOverride();
                  clearPendingFeedPlayback();
                  setDeletingId(null);
                }
              })(),
          },
        ]
      );
    },
    [user?.uid, clearPostedOverride, clearPendingFeedPlayback]
  );

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) {
      setVideos([]);
      setFeedHydrated(true);
      loadMoreFeedRef.current = null;
      refreshFeedRef.current = null;
      pollNewerFeedRef.current = null;
      return;
    }

    setFeedHydrated(false);
    let cancelled = false;
    let mineUnsub: (() => void) | null = null;
    let approvedVideos: FeedVideo[] = [];
    let mineDocs: FeedVideo[] = [];
    let feedCursor: FeedApprovedPageCursor = { dayIndex: 0, lastDoc: null };
    let feedHasMore = true;
    let feedDayChain: string[] = [];
    let approvedLoadDone = false;
    let mineListenerSeen = false;
    let loadingMore = false;

    const bumpHydrated = () => {
      if (cancelled) return;
      const hasPosts = mineDocs.length > 0 || approvedVideos.length > 0;
      if (hasPosts || approvedLoadDone) {
        setFeedHydrated(true);
      }
    };

    const docToFeedVideo = (d: QueryDocumentSnapshot): FeedVideo => {
      const data: any = d.data();
      // Credit mirrors stay off the shared feed (posted-today still uses the credit doc).
      if (isHiddenCoLeapCreditDoc(data)) {
        return {
          id: d.id,
          username: String(data?.username ?? 'user'),
          prompt: '',
          url: '',
          createdAtMs: 0,
          ownerUid: String(data?.uid ?? ''),
          moderationStatus: String(data?.moderationStatus ?? 'approved'),
          maxDurationSeconds: 0,
          challengeDate: viewingChallengeDateKey,
          likesCount: 0,
          commentsCount: 0,
        };
      }
      const createdAtMs =
        typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
      const rawCd = data?.challengeDate;
      const cdRaw =
        rawCd && typeof (rawCd as { toDate?: () => Date }).toDate === 'function'
          ? nyDateKey((rawCd as { toDate: () => Date }).toDate())
          : String(rawCd ?? '');
      const challengeDate = normalizeNyDateKey(cdRaw, viewingChallengeDateKey);
      const secondaryUrlRaw = String(data?.secondaryUrl ?? '').trim();
      const feedUrlRaw = String(data?.feedUrl ?? '').trim();
      const feedSecondaryUrlRaw = String(data?.feedSecondaryUrl ?? '').trim();
      const posterUrlRaw = String(data?.posterUrl ?? '').trim();
      const dualFrontIsPrimary = data?.dualFrontIsPrimary === true;
      const coLeapInvitees = parseCoLeapInvitees(data?.coLeapInvitees).map((i) => ({
        uid: i.uid,
        username: i.username,
        status: i.status,
      }));
      return {
        id: d.id,
        username: String(data?.username ?? 'user'),
        prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
        url: String(data?.url ?? ''),
        ...(secondaryUrlRaw ? { secondaryUrl: secondaryUrlRaw } : {}),
        ...(feedUrlRaw ? { feedUrl: feedUrlRaw } : {}),
        ...(feedSecondaryUrlRaw ? { feedSecondaryUrl: feedSecondaryUrlRaw } : {}),
        ...(posterUrlRaw ? { posterUrl: posterUrlRaw } : {}),
        ...(dualFrontIsPrimary ? { dualFrontIsPrimary: true } : {}),
        ...(data?.mediaType === 'photo' ? { mediaType: 'photo' as const } : {}),
        createdAtMs,
        ownerUid: String(data?.uid ?? ''),
        moderationStatus: String(data?.moderationStatus ?? 'approved'),
        maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
        challengeDate,
        likesCount: Math.max(0, Number(data?.likesCount ?? 0)),
        commentsCount: Math.max(0, Number(data?.commentsCount ?? 0)),
        ...(coLeapInvitees.length > 0 ? { coLeapInvitees } : {}),
      };
    };

    const merge = () => {
      if (cancelled) return;
      const waitForApproved =
        FEED_GATE_V2 || canViewEveryoneFeedRef.current;
      if (waitForApproved && !approvedLoadDone) {
        return;
      }
      const map = new Map<string, FeedVideo>();
      for (const v of [...mineDocs, ...approvedVideos]) {
        if (!v.url) continue;
        map.set(v.id, v);
      }
      const merged = Array.from(map.values()).sort((a, b) => {
        const msB = nyDateKeyToSortUtcMs(b.challengeDate, 0);
        const msA = nyDateKeyToSortUtcMs(a.challengeDate, 0);
        if (msB !== msA) return msB - msA;
        return b.createdAtMs - a.createdAtMs;
      });
      setVideos((prev) => (feedVideosRowEqual(prev, merged) ? prev : merged));
      if (merged.length > 0) bumpHydrated();
    };

    const loadApprovedPage = async (reset: boolean) => {
      if (cancelled) return;
      if (!reset && (!feedHasMore || loadingMore || feedDayChain.length === 0)) return;
      loadingMore = true;
      try {
        const result = reset
          ? await fetchFirstApprovedFeedPage(feedDayChain, docToFeedVideo)
          : await fetchNextApprovedFeedPage(feedDayChain, feedCursor, docToFeedVideo);
        if (cancelled) return;
        feedCursor = result.cursor;
        feedHasMore = result.hasMore;
        if (reset) {
          approvedVideos = result.videos;
        } else if (result.videos.length > 0) {
          const existingIds = new Set(approvedVideos.map((v) => v.id));
          for (const v of result.videos) {
            if (!existingIds.has(v.id)) approvedVideos.push(v);
          }
        }
        approvedLoadDone = true;
        merge();
        bumpHydrated();
      } catch {
        if (!cancelled) {
          approvedLoadDone = true;
          merge();
          bumpHydrated();
        }
      } finally {
        loadingMore = false;
      }
    };

    refreshFeedRef.current = () => loadApprovedPage(true);
    loadMoreFeedRef.current = () => {
      void loadApprovedPage(false);
    };
    pollNewerFeedRef.current = () => {
      if (cancelled || feedDayChain.length === 0) return;
      const newestDay = feedDayChain[0]!;
      const newestMs = Math.max(
        0,
        ...approvedVideos.map((v) => v.createdAtMs),
        ...mineDocs.map((v) => v.createdAtMs)
      );
      void fetchNewerApprovedFeedSince(newestDay, newestMs, docToFeedVideo)
        .then((newer) => {
          if (cancelled || newer.length === 0) return;
          const existingIds = new Set(approvedVideos.map((v) => v.id));
          const toAdd = newer.filter((v) => !existingIds.has(v.id));
          if (toAdd.length === 0) return;
          approvedVideos = [...toAdd, ...approvedVideos];
          merge();
        })
        .catch(() => {});
    };

    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      approvedLoadDone = true;
      mineListenerSeen = true;
      merge();
      setFeedHydrated(true);
    }, FEED_HYDRATE_SAFETY_MS);

    const calToday = nyDateKey();
    const anchorKey = normalizeNyDateKey(viewingChallengeDateKey, calToday);
    const leapChain = nyLeapDayChainBackward(anchorKey, FEED_DAY_WINDOW);
    const calNorm = normalizeNyDateKey(calToday, calToday);
    feedDayChain =
      calNorm && calNorm !== anchorKey ? [calNorm, ...leapChain] : leapChain;

    void loadApprovedPage(true);

    const mineRef = doc(
      firestore(),
      'videos',
      todayVideoDocId(user.uid, viewingChallengeDateKey)
    );
    mineUnsub = onSnapshot(
      mineRef,
      (snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          mineDocs = [];
        } else {
          const data: any = snap.data();
          // Co-Leap credit docs unlock the day but are not a second feed row.
          if (isHiddenCoLeapCreditDoc(data)) {
            mineDocs = [];
          } else {
          const createdAtMs =
            typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
          const rawMineCd = data?.challengeDate;
          const mineCdRaw =
            rawMineCd && typeof (rawMineCd as { toDate?: () => Date }).toDate === 'function'
              ? nyDateKey((rawMineCd as { toDate: () => Date }).toDate())
              : String(rawMineCd ?? '');
          const mineSecondaryUrl = String(data?.secondaryUrl ?? '').trim();
          const mineFeedUrl = String(data?.feedUrl ?? '').trim();
          const mineFeedSecondaryUrl = String(data?.feedSecondaryUrl ?? '').trim();
          const minePosterUrl = String(data?.posterUrl ?? '').trim();
          const mineDualFrontIsPrimary = data?.dualFrontIsPrimary === true;
          const mineCoLeap = parseCoLeapInvitees(data?.coLeapInvitees).map((i) => ({
            uid: i.uid,
            username: i.username,
            status: i.status,
          }));
          mineDocs = [
            {
              id: snap.id,
              username: String(data?.username ?? 'user'),
              prompt: String(data?.prompt ?? data?.challengeTitle ?? ''),
              url: String(data?.url ?? ''),
              ...(mineSecondaryUrl ? { secondaryUrl: mineSecondaryUrl } : {}),
              ...(mineFeedUrl ? { feedUrl: mineFeedUrl } : {}),
              ...(mineFeedSecondaryUrl ? { feedSecondaryUrl: mineFeedSecondaryUrl } : {}),
              ...(minePosterUrl ? { posterUrl: minePosterUrl } : {}),
              ...(mineDualFrontIsPrimary ? { dualFrontIsPrimary: true } : {}),
              ...(data?.mediaType === 'photo' ? { mediaType: 'photo' as const } : {}),
              createdAtMs,
              ownerUid: String(data?.uid ?? ''),
              moderationStatus: String(data?.moderationStatus ?? 'pending'),
              maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
              challengeDate: normalizeNyDateKey(mineCdRaw, viewingChallengeDateKey),
              likesCount: Math.max(0, Number(data?.likesCount ?? 0)),
              commentsCount: Math.max(0, Number(data?.commentsCount ?? 0)),
              ...(mineCoLeap.length > 0 ? { coLeapInvitees: mineCoLeap } : {}),
            },
          ];
          }
        }
        merge();
        mineListenerSeen = true;
        bumpHydrated();
      },
      () => {
        if (cancelled) return;
        mineDocs = [];
        merge();
        mineListenerSeen = true;
        bumpHydrated();
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      mineUnsub?.();
      loadMoreFeedRef.current = null;
      refreshFeedRef.current = null;
      pollNewerFeedRef.current = null;
    };
  }, [viewingChallengeDateKey, user?.uid]);

  useFocusEffect(
    React.useCallback(() => {
      if (!feedHydrated) return;
      pollNewerFeedRef.current?.();
    }, [feedHydrated])
  );

  if (feedMode === 'bpotd') {
    return <BestPartScreen embedded onRequestDaily={() => setFeedMode('daily')} />;
  }

  if (!user?.uid) {
    return <TakeTheLeapGate variant="feed" />;
  }

  if (FEED_GATE_V2 && user?.uid && !hasEverPostedHydrated) {
    return (
      <Screen style={styles.feedScreen}>
        <View style={styles.previewLockLoading}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </Screen>
    );
  }

  const showFeedPreviewChoice =
    !FEED_GATE_V2 &&
    feedPreviewMode &&
    feedPreviewLockHydrated &&
    !feedPreviewConsumed &&
    !feedPreviewStarted &&
    !feedPreviewSessionActive;

  const previewVideosReady = feedHydrated && displayVideos.length > 0;

  if (!FEED_GATE_V2 && feedPreviewMode && !feedPreviewLockHydrated) {
    return (
      <Screen style={styles.feedScreen}>
        <View style={styles.previewLockLoading}>
          <ActivityIndicator size="large" color={colors.text} />
        </View>
      </Screen>
    );
  }

  if (!FEED_GATE_V2 && feedPreviewMode && feedPreviewConsumed && !feedPreviewSessionActive) {
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

  if (
    !FEED_GATE_V2 &&
    feedPreviewMode &&
    feedPreviewStarted &&
    feedHydrated &&
    displayVideos.length === 0 &&
    !feedPreviewConsumed
  ) {
    return <TakeTheLeapGate variant="feed" />;
  }

  return (
    <Screen style={styles.feedScreen}>
      <View ref={feedSlotRef} style={styles.feedSlot} onLayout={onSlotLayout} collapsable={false}>
        <ModernFeedModeSwitch
          active="daily"
          onDailyPress={scrollToTop}
          onBestPress={() => setFeedMode('bpotd')}
          style={styles.modeSwitch}
        />
        <FlatList
          ref={flatListRef}
          style={styles.reelList}
          data={displayVideos}
          keyExtractor={(x) => x.id}
          extraData={flatListExtraData}
          refreshControl={
            (FEED_GATE_V2 || (canViewEveryoneFeed && !feedPreviewMode)) ? (
              <RefreshControl
                refreshing={feedRefreshing}
                onRefresh={onPullRefreshFeed}
                tintColor={colors.moss}
                colors={[colors.moss]}
              />
            ) : undefined
          }
          viewabilityConfig={FEED_VIEWABILITY_CONFIG}
          onViewableItemsChanged={onViewableItemsChanged}
          onScroll={onFeedScroll}
          onMomentumScrollEnd={onFeedMomentumScrollEnd}
          scrollEventThrottle={64}
          onEndReached={FEED_GATE_V2 || (canViewEveryoneFeed && !feedPreviewMode) ? onEndReachedFeed : undefined}
          onEndReachedThreshold={0.6}
          contentContainerStyle={displayVideos.length === 0 ? { flexGrow: 1 } : undefined}
          pagingEnabled
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          removeClippedSubviews={false}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          windowSize={tier2HasActiveLocks ? 1 : 3}
          updateCellsBatchingPeriod={50}
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

            /**
             * Locked tiles must NEVER mount FeedPostVideo / expo-av / expo-video.
             * Unlocked active ± neighbors keep paused decoders warm for snappy swipe.
             * Data saver keeps active-only mounting.
             */
            const wouldBeTier2Locked =
              TIER2_CARD_LOCKS_ENABLED &&
              isTier2Established &&
              postedDatesReady &&
              (!lastPostedDateKey ||
                isTier2CardLocked({
                  challengeDate: item.challengeDate,
                  lastPostedDateKey,
                  hasPostedToday: false,
                  bypassFeedGate,
                }));
            const isTier2Locked = tier2CardLocksApply && wouldBeTier2Locked;
            const awaitingLockDecision = tier2CardLocksApply && !postedDatesReady;
            const showLockedOverlay =
              wouldBeTier2Locked && (isTier2Locked || tier2UnlockAnimating);
            const overlayUnlocking =
              tier2UnlockAnimating && wouldBeTier2Locked && !isTier2Locked;
            const freezeLocked = showLockedOverlay || awaitingLockDecision;
            const isActive = activeVideoId === item.id;
            const isNext = index === activePreloadIndex + FEED_PRELOAD_AHEAD;
            const isPrev =
              FEED_PRELOAD_BEHIND > 0 && index === activePreloadIndex - FEED_PRELOAD_BEHIND;
            // Keep ±1 decoders warm so the paging swipe never lands on a dark empty cell.
            const warmNeighbor =
              !preferences.dataSaver && (isNext || isPrev);
            const mountVideo = isFocused && !freezeLocked && (isActive || warmNeighbor);
            const shouldPlay = isFocused && !freezeLocked && isActive;
            const playback = resolveFeedPlaybackUrls(item, pendingFeedPlayback);
            const dayTag =
              item.challengeDate && item.challengeDate !== viewingChallengeDateKey
                ? item.challengeDate === previousChallengeDateKey
                  ? 'Previous challenge'
                  : item.challengeDate
                : null;

            return (
              <FeedReelRow
                item={item}
                pageHeight={pageHeight}
                sheetBottom={sheetBottom}
                tabBarClearance={tabBarClearance}
                mountVideo={mountVideo}
                shouldPlay={shouldPlay}
                isFocused={isFocused}
                freezeLocked={freezeLocked}
                showLockedOverlay={showLockedOverlay}
                overlayUnlocking={overlayUnlocking}
                showPreviousLeapsChip={showPreviousLeapsChip}
                showSwipeHint={displayVideos.length > 1}
                dayTag={dayTag}
                playback={playback}
                posterUrl={item.posterUrl}
                dataSaver={preferences.dataSaver}
                viewerUid={user?.uid}
                viewerUsername={user?.username}
                canStaffMod={canStaffMod}
                deletingId={deletingId}
                nullingId={nullingId}
                showFollowButton={Boolean(
                  user?.uid && item.ownerUid !== user.uid && item.id === activeVideoId
                )}
                showEngagement={item.id === activeVideoId && !showLockedOverlay}
                onReelSheetLayout={onReelSheetLayout}
                onReelActivate={activateReelVideo}
                onReady={isActive ? onActiveReelReady : undefined}
                onConfirmDelete={confirmDelete}
                onConfirmStaffNull={confirmStaffNull}
              />
            );
          }}
        />
        {showLastLeapJump ? (
          <FeedLastLeapJumpChip onPress={scrollToLastLeap} bottom={lastLeapChipBottom} />
        ) : null}
        {showScrollTop ? (
          <TouchableOpacity
            style={[styles.scrollTopFab, { bottom: scrollTopFabBottom }]}
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
        {cameraRollSaveOffer ||
        (!FEED_GATE_V2 && feedPreviewMode && feedPreviewStarted && !feedPreviewConsumed) ||
        showTeaserWallBar ||
        graduationWallDissolving ||
        showTier1ExploreBanner ||
        showSinceLastLeapBanner ||
        (showReferralNudge &&
          referralNudgeHydrated &&
          !showTeaserWallBar &&
          !graduationWallDissolving &&
          !showTier1ExploreBanner &&
          !showSinceLastLeapBanner) ? (
          <View style={styles.feedBannerStack} pointerEvents="box-none">
            {cameraRollSaveOffer ? (
              <FeedCameraRollSaveBanner
                clipUri={cameraRollSaveOffer.uri}
                challenge={cameraRollSaveOffer.challenge}
                onDismiss={() => setCameraRollSaveOffer(null)}
              />
            ) : null}
            {!FEED_GATE_V2 && feedPreviewMode && feedPreviewStarted && !feedPreviewConsumed ? (
              <View style={styles.previewBanner} pointerEvents="none">
                <Text style={styles.previewBannerText}>
                  Preview — swipe up to {FEED_PREVIEW_SCROLL_LIMIT} leaps, then take yours to unlock the feed
                </Text>
              </View>
            ) : null}
            {showTeaserWallBar || graduationWallDissolving ? (
              <FeedTeaserWallBar dissolving={graduationWallDissolving} />
            ) : null}
            {showTier1ExploreBanner ? (
              <FeedTier1ExploreBanner teaserLimit={effectiveTeaserLimit} />
            ) : null}
            {showSinceLastLeapBanner ? (
              <FeedSinceLastLeapBanner
                count={leapsSinceLastPost}
                loading={!leapsSinceLastPostReady}
              />
            ) : null}
            {showReferralNudge &&
            referralNudgeHydrated &&
            !showTeaserWallBar &&
            !graduationWallDissolving &&
            !showTier1ExploreBanner &&
            !showSinceLastLeapBanner ? (
              <View style={styles.referralNudge}>
                <Text style={styles.referralNudgeText}>
                  Know someone who&apos;d leap with you?{' '}
                  <Text
                    style={styles.referralNudgeLink}
                    onPress={() => void shareReferralInvite(inviteUsername)}
                  >
                    Invite
                  </Text>
                </Text>
                <TouchableOpacity
                  onPress={dismissReferralNudge}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Dismiss"
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
      <FeedGraduationMoment visible={showGraduation} onDismiss={dismissGraduation} />
    </Screen>
  );
}

import { normalizeNyDateKey, nextNyDateKey, nyDateKeyToSortUtcMs } from '../utils/nyTime';

/** Feature flag — new tier-based feed gate (legacy preview path dormant when true). */
export const FEED_GATE_V2 = true;

/** Per-card frosted locks on newer leap days (tier 2) — video keeps playing under the tile. */
export const TIER2_CARD_LOCKS_ENABLED = true;

export type FeedGateTier = 'tier1_teaser' | 'tier2_daily';

export function resolveFeedGateTier(hasEverPosted: boolean): FeedGateTier {
  return hasEverPosted ? 'tier2_daily' : 'tier1_teaser';
}

/**
 * Leap day keys from the day after the user's most recent post through the active viewing cycle
 * (accumulates across missed days). Empty when the user already posted for `viewingChallengeDateKey`.
 */
export function missedLeapDayKeysSinceLastPost(args: {
  postedDates: ReadonlySet<string>;
  viewingChallengeDateKey: string;
}): string[] {
  const viewing = normalizeNyDateKey(args.viewingChallengeDateKey, '');
  if (!viewing) return [];

  const lastKey = maxPostedChallengeDateKey(args.postedDates);
  if (!lastKey) return [viewing];

  const lastMs = nyDateKeyToSortUtcMs(lastKey, 0);
  const viewingMs = nyDateKeyToSortUtcMs(viewing, 0);
  if (lastMs >= viewingMs) {
    return userPostedOnChallengeDate(args.postedDates, viewing) ? [] : [viewing];
  }

  const keys: string[] = [];
  let cur = nextNyDateKey(lastKey);
  for (let guard = 0; guard < 90; guard++) {
    const curMs = nyDateKeyToSortUtcMs(cur, 0);
    if (curMs > viewingMs) break;
    keys.push(cur);
    if (cur === viewing) break;
    cur = nextNyDateKey(cur);
  }
  return keys;
}

export function maxPostedChallengeDateKey(postedDates: ReadonlySet<string>): string | null {
  let best: string | null = null;
  let bestMs = -1;
  for (const raw of postedDates) {
    const k = normalizeNyDateKey(raw, '');
    if (!k) continue;
    const ms = nyDateKeyToSortUtcMs(k, 0);
    if (ms > bestMs) {
      bestMs = ms;
      best = k;
    }
  }
  return best;
}

export function userPostedOnChallengeDate(
  postedDates: ReadonlySet<string>,
  challengeDate: string
): boolean {
  const cd = normalizeNyDateKey(challengeDate, '');
  if (!cd) return false;
  for (const raw of postedDates) {
    if (normalizeNyDateKey(raw, '') === cd) return true;
  }
  return false;
}

export function tier1MaxScrollIndex(teaserLimit: number): number {
  const n = Math.floor(teaserLimit);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.max(0, n - 1);
}

export function tier1MaxScrollOffset(teaserLimit: number, pageHeight: number): number {
  if (pageHeight <= 0) return 0;
  return tier1MaxScrollIndex(teaserLimit) * pageHeight;
}

export function isAtTier1Wall(activeScrollIndex: number, teaserLimit: number): boolean {
  return activeScrollIndex >= tier1MaxScrollIndex(teaserLimit);
}

/**
 * Tier 2 per-card lock: leaps after the user's last posted day stay in the feed but locked.
 * Last posted day and everything before it play freely until they post for the active cycle.
 */
export function isTier2CardLocked(args: {
  challengeDate: string;
  lastPostedDateKey: string | null;
  hasPostedToday: boolean;
  bypassFeedGate?: boolean;
}): boolean {
  if (args.bypassFeedGate) return false;
  if (args.hasPostedToday) return false;

  const cd = normalizeNyDateKey(args.challengeDate, '');
  if (!cd) return false;

  const lastKey = args.lastPostedDateKey
    ? normalizeNyDateKey(args.lastPostedDateKey, '')
    : '';
  // Missing last-post date: fail open (don't frost the entire feed blank).
  if (!lastKey) return false;

  const cdMs = nyDateKeyToSortUtcMs(cd, 0);
  const lastMs = nyDateKeyToSortUtcMs(lastKey, 0);
  return cdMs > lastMs;
}

type FeedJumpVideo = {
  id: string;
  ownerUid: string;
  challengeDate: string;
};

/**
 * FlatList index for the tier-2 "Last leap" chip — the last card on the viewer's last
 * allowed leap day (bottom of that day's block in the feed), so they can scroll from there.
 */
export function tier2LastLeapJumpIndex(args: {
  videos: ReadonlyArray<FeedJumpVideo>;
  lastPostedDateKey: string | null;
}): number {
  const { lastPostedDateKey, videos } = args;
  if (!lastPostedDateKey || videos.length === 0) return -1;

  const lastKey = normalizeNyDateKey(lastPostedDateKey, '');
  if (!lastKey) return -1;

  let lastDayIdx = -1;
  for (let i = 0; i < videos.length; i++) {
    if (normalizeNyDateKey(videos[i].challengeDate, '') === lastKey) {
      lastDayIdx = i;
    }
  }
  if (lastDayIdx >= 0) return lastDayIdx;

  const lastMs = nyDateKeyToSortUtcMs(lastKey, 0);
  for (let i = 0; i < videos.length; i++) {
    const cd = normalizeNyDateKey(videos[i].challengeDate, '');
    if (nyDateKeyToSortUtcMs(cd, 0) <= lastMs) return i;
  }
  return -1;
}

/** Whether the tier-2 "Last leap" jump chip should show (above the allowed leap-day boundary). */
export function shouldShowLastLeapJumpChip(args: {
  tier2NeedsPostToUnlock: boolean;
  lastPostedDateKey: string | null;
  lastLeapJumpIndex: number;
  activeScrollIndex: number;
  activeChallengeDate: string | undefined;
  hasPostedToday: boolean;
  bypassFeedGate?: boolean;
}): boolean {
  if (!args.tier2NeedsPostToUnlock || !args.lastPostedDateKey) return false;

  if (args.lastLeapJumpIndex >= 0) {
    return args.activeScrollIndex < args.lastLeapJumpIndex;
  }

  if (!args.activeChallengeDate) return true;

  return isTier2CardLocked({
    challengeDate: args.activeChallengeDate,
    lastPostedDateKey: args.lastPostedDateKey,
    hasPostedToday: args.hasPostedToday,
    bypassFeedGate: args.bypassFeedGate,
  });
}

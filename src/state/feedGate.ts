import { normalizeNyDateKey, nextNyDateKey, nyDateKeyToSortUtcMs } from '../utils/nyTime';

/** Feature flag — new tier-based feed gate (legacy preview path dormant when true). */
export const FEED_GATE_V2 = true;

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
  if (!lastKey) return true;

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
 * FlatList index to jump to for the tier-2 "Last post" chip — viewer's post on their last
 * leap day, else the first card on that day, else the newest unlocked card in the feed.
 */
export function tier2LastPostJumpIndex(args: {
  videos: ReadonlyArray<FeedJumpVideo>;
  viewerUid: string | undefined;
  lastPostedDateKey: string | null;
}): number {
  const { viewerUid, lastPostedDateKey, videos } = args;
  if (!viewerUid || !lastPostedDateKey || videos.length === 0) return -1;

  const lastKey = normalizeNyDateKey(lastPostedDateKey, '');
  if (!lastKey) return -1;

  const ownId = `${viewerUid}_${lastKey}`;
  const ownIdx = videos.findIndex((v) => v.id === ownId);
  if (ownIdx >= 0) return ownIdx;

  const ownDayIdx = videos.findIndex(
    (v) => v.ownerUid === viewerUid && normalizeNyDateKey(v.challengeDate, '') === lastKey
  );
  if (ownDayIdx >= 0) return ownDayIdx;

  const dayIdx = videos.findIndex(
    (v) => normalizeNyDateKey(v.challengeDate, '') === lastKey
  );
  if (dayIdx >= 0) return dayIdx;

  const lastMs = nyDateKeyToSortUtcMs(lastKey, 0);
  for (let i = 0; i < videos.length; i++) {
    const cd = normalizeNyDateKey(videos[i].challengeDate, '');
    if (nyDateKeyToSortUtcMs(cd, 0) <= lastMs) return i;
  }
  return -1;
}

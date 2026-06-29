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

  let lastMs = -1;
  let lastKey = '';
  for (const raw of args.postedDates) {
    const k = normalizeNyDateKey(raw, '');
    if (!k) continue;
    const ms = nyDateKeyToSortUtcMs(k, 0);
    if (ms > lastMs) {
      lastMs = ms;
      lastKey = k;
    }
  }

  if (!lastKey) return [viewing];

  const viewingMs = nyDateKeyToSortUtcMs(viewing, 0);
  if (lastMs >= viewingMs) {
    return args.postedDates.has(viewing) ? [] : [viewing];
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
 * Tier 2 per-card lock: past dates and dates the user posted stay open; today + future lock
 * until the user has posted for `viewingChallengeDateKey`.
 */
export function isTier2CardLocked(args: {
  challengeDate: string;
  viewingChallengeDateKey: string;
  userPostedDates: ReadonlySet<string>;
  hasPostedToday: boolean;
  bypassFeedGate?: boolean;
}): boolean {
  if (args.bypassFeedGate) return false;
  if (args.hasPostedToday) return false;

  const cd = normalizeNyDateKey(args.challengeDate, '');
  const viewing = normalizeNyDateKey(args.viewingChallengeDateKey, '');
  if (!cd || !viewing) return false;

  if (args.userPostedDates.has(cd)) return false;

  const cdMs = nyDateKeyToSortUtcMs(cd, 0);
  const viewingMs = nyDateKeyToSortUtcMs(viewing, 0);
  if (cdMs < viewingMs) return false;

  return cdMs >= viewingMs;
}

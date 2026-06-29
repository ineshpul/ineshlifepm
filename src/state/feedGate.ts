import { normalizeNyDateKey, nyDateKeyToSortUtcMs } from '../utils/nyTime';

/** Feature flag — new tier-based feed gate (legacy preview path dormant when true). */
export const FEED_GATE_V2 = true;

export type FeedGateTier = 'tier1_teaser' | 'tier2_daily';

export function resolveFeedGateTier(hasEverPosted: boolean): FeedGateTier {
  return hasEverPosted ? 'tier2_daily' : 'tier1_teaser';
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

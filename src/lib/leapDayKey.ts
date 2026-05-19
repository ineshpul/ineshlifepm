import {
  challengeDateKeysForFirestoreIn,
  computeFeedViewingFromNow,
  normalizeNyDateKey,
  nyDateKey,
} from '../utils/nyTime';

export type LeapDayKeyTimezone = 'America/New_York';

/**
 * Canonical leap-cycle day id (`YYYY-MM-DD`, America/New_York, noon→noon).
 * Same key for `videos.challengeDate`, `dailyChallengeStats/{dayKey}`, and the home "posted today" count.
 */
export function getDayKey(timezone: LeapDayKeyTimezone, ms: number = Date.now()): string {
  if (timezone !== 'America/New_York') {
    throw new Error(`Unsupported timezone for leap day key: ${timezone}`);
  }
  return computeFeedViewingFromNow(ms).viewingChallengeDateKey;
}

/** Normalize a stored `videos.challengeDate` to the stats doc id (padded leap day key). */
export function leapDayKeyFromStoredChallengeDate(
  storedChallengeDate: string,
  fallbackMs: number = Date.now()
): string {
  const trimmed = String(storedChallengeDate ?? '').trim();
  if (!trimmed) {
    return getDayKey('America/New_York', fallbackMs);
  }
  const variants = challengeDateKeysForFirestoreIn([trimmed]);
  const padded = variants.find((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  return padded ?? normalizeNyDateKey(trimmed, getDayKey('America/New_York', fallbackMs));
}

/**
 * `challengeDate` values to match for "posted today" — mirrors Feed (leap key + calendar day when they differ).
 */
export function todayPostedCountChallengeDateInKeys(nowMs: number = Date.now()): string[] {
  const leapKey = getDayKey('America/New_York', nowMs);
  const calToday = nyDateKey(new Date(nowMs));
  const leapNorm = normalizeNyDateKey(leapKey, leapKey);
  const calNorm = normalizeNyDateKey(calToday, calToday);
  const dayChain = calNorm !== leapNorm ? [calNorm, leapNorm] : [leapNorm];
  return challengeDateKeysForFirestoreIn(dayChain);
}

/** `dailyChallengeStats` document ids to listen to for the active posting window. */
export function todayPostedCountStatsDocKeys(nowMs: number = Date.now()): string[] {
  const leapKey = getDayKey('America/New_York', nowMs);
  const calToday = nyDateKey(new Date(nowMs));
  const leapNorm = normalizeNyDateKey(leapKey, leapKey);
  const calNorm = normalizeNyDateKey(calToday, calToday);
  if (calNorm !== leapNorm) return [leapNorm, calNorm];
  return [leapNorm];
}

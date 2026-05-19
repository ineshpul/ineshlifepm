import { computeFeedViewingFromNow, challengeDateKeysForFirestoreIn, normalizeNyDateKey } from '../utils/nyTime';

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

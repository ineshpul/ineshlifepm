import {
  challengeDateKeysForFirestoreIn,
  leapChallengeDateKeyFromMs,
} from './timeKeys';

export type LeapDayKeyTimezone = 'America/New_York';

/**
 * Canonical leap-cycle day id (`YYYY-MM-DD`, America/New_York, noon→noon).
 * Matches client `getDayKey('America/New_York', ms)`.
 */
export function getDayKey(timezone: LeapDayKeyTimezone, ms: number = Date.now()): string {
  if (timezone !== 'America/New_York') {
    throw new Error(`Unsupported timezone for leap day key: ${timezone}`);
  }
  return leapChallengeDateKeyFromMs(ms);
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
  return padded ?? getDayKey('America/New_York', fallbackMs);
}

/** @deprecated Use leapDayKeyFromStoredChallengeDate */
export const canonicalChallengeDayKey = leapDayKeyFromStoredChallengeDate;

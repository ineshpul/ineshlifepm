import { challengeDateBelongsToLeapWeek, normalizeNyDateKey } from '../utils/nyTime';

export type ProfileLeapVideo = {
  challengeDate: string;
  moderationStatus: string;
  leapInches?: number;
  leapInchesAwarded?: number;
};

function inchFromVideo(v: ProfileLeapVideo): number {
  const raw = Number(v.leapInches ?? v.leapInchesAwarded ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** Same rules as the Daily leaperboard: approved inches on this leap `challengeDate`. */
export function dailyLeapInchesFromProfileVideos(
  videos: readonly ProfileLeapVideo[],
  leapDayKey: string
): number {
  const dayKey = normalizeNyDateKey(leapDayKey, '');
  let sum = 0;
  for (const v of videos) {
    if (String(v.moderationStatus ?? '') !== 'approved') continue;
    if (normalizeNyDateKey(v.challengeDate, dayKey) !== dayKey) continue;
    sum += inchFromVideo(v);
  }
  return Math.round(sum * 10) / 10;
}

/** Running week total: all approved leap days in the current leap week, summed together. */
export function weeklyLeapInchesFromProfileVideos(
  videos: readonly ProfileLeapVideo[],
  weekKey: string
): number {
  const wk = normalizeNyDateKey(weekKey, '');
  let sum = 0;
  for (const v of videos) {
    if (String(v.moderationStatus ?? '') !== 'approved') continue;
    if (!challengeDateBelongsToLeapWeek(v.challengeDate, wk)) continue;
    sum += inchFromVideo(v);
  }
  return Math.round(sum * 10) / 10;
}

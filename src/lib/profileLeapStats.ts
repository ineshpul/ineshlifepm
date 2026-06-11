import { normalizeWeekKey } from './getCurrentWeekKey';
import { normalizeNyDateKey, nyLeapWeekChallengeDateKeys } from '../utils/nyTime';

export type ProfileLeapVideo = {
  challengeDate: string;
  moderationStatus: string;
  leapInches?: number;
  leapInchesAwarded?: boolean;
  awardedVerticalXP?: boolean;
  deleted?: boolean;
};

/** Mirrors `countsForStreak` in `functions/src/verticalScoreEngine.ts`. */
export function countsForStreakFromProfileVideo(v: ProfileLeapVideo): boolean {
  if (v.deleted === true) return false;
  const status = String(v.moderationStatus ?? '');
  if (status === 'nulled' || status === 'rejected') return false;
  if (status !== 'approved') return false;
  if (v.leapInchesAwarded === true) return true;
  if (v.awardedVerticalXP === true) return true;
  const li = Number(v.leapInches ?? 0);
  return Number.isFinite(li) && li > 0;
}

/** True when the user has at least one approved, awarded leap (streak may be shown). */
export function hasQualifyingStreakLeap(videos: readonly ProfileLeapVideo[]): boolean {
  return videos.some(countsForStreakFromProfileVideo);
}

/** Mirrors `leapDateKeyGapDays` in `functions/src/verticalScoreStreak.ts`. */
export function leapDateKeyGapDays(olderKey: string, newerKey: string): number {
  const parse = (k: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k).trim());
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = parse(olderKey);
  const b = parse(newerKey);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Mirrors `isActiveLeapStreakAlive` in `functions/src/verticalScoreStreak.ts`. */
export function isActiveLeapStreakAlive(
  lastApprovedLeapDateKey: string,
  todayLeapDayKey: string
): boolean {
  const last = String(lastApprovedLeapDateKey ?? '').trim();
  const today = String(todayLeapDayKey ?? '').trim();
  if (!last || !today) return false;
  return leapDateKeyGapDays(last, today) <= 1;
}

function latestQualifyingStreakDay(videos: readonly ProfileLeapVideo[]): string {
  let latest = '';
  for (const v of videos) {
    if (!countsForStreakFromProfileVideo(v)) continue;
    const k = normalizeNyDateKey(v.challengeDate, '');
    if (!latest || k > latest) latest = k;
  }
  return latest;
}

/** Stored active streak, shown only when the last qualifying leap was today or yesterday. */
export function activeLeapStreakForDisplay(args: {
  profile?: Record<string, unknown>;
  videos: readonly ProfileLeapVideo[];
  todayLeapDayKey: string;
}): number {
  const stored = Math.max(0, Math.floor(Number(args.profile?.activeLeapStreakDays ?? 0)));
  if (stored <= 0) return 0;
  if (!hasQualifyingStreakLeap(args.videos)) return 0;

  const lastFromProfile = String(args.profile?.lastApprovedLeapDateKey ?? '').trim();
  const lastKey = lastFromProfile || latestQualifyingStreakDay(args.videos);
  if (!isActiveLeapStreakAlive(lastKey, args.todayLeapDayKey)) return 0;
  return stored;
}

function inchFromVideo(v: ProfileLeapVideo): number {
  const raw = Number(v.leapInches ?? 0);
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
    const status = String(v.moderationStatus ?? '');
    if (status !== 'approved' && status !== 'pending') continue;
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
  const wk = normalizeWeekKey(weekKey);
  if (!wk) return 0;
  const daySet = new Set(nyLeapWeekChallengeDateKeys(wk).map((k) => normalizeNyDateKey(k, k)));
  let sum = 0;
  for (const v of videos) {
    const status = String(v.moderationStatus ?? '');
    if (status !== 'approved' && status !== 'pending') continue;
    if (!daySet.has(normalizeNyDateKey(v.challengeDate, ''))) continue;
    sum += inchFromVideo(v);
  }
  return Math.round(sum * 10) / 10;
}

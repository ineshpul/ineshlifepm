/**
 * Leap vertical scoring — inches only (mirrors `src/lib/verticalScore.ts`).
 */
import {
  expireActiveStreakIfBroken,
  isActiveLeapStreakAlive,
  leapDateKeyGapDays,
  updateStreakState,
} from './verticalScoreStreak';

export { expireActiveStreakIfBroken, isActiveLeapStreakAlive, leapDateKeyGapDays, updateStreakState };

export const LEAP_BASE_INCHES = 5;
export const LEAP_FIRST_BONUS_BASE_INCHES = 10;
/** Inches subtracted from nominal leap base when user bought a bonus recording attempt. */
export const BONUS_ATTEMPT_BASE_REDUCTION_INCHES = 5;

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Streak multiplier applied to base inches before engagement is added. */
export function streakMultiplierForDays(streakDays: number): number {
  const s = Math.max(0, Math.floor(Number(streakDays ?? 0)));
  if (s >= 30) return 1.5;
  if (s >= 14) return 1.4;
  if (s >= 7) return 1.25;
  if (s >= 2) return 1.1;
  return 1;
}

export type PostLeapInchesInput = {
  /** Active streak days **before** this leap (for multiplier). */
  streakDays: number;
  isFirstEverLeap: boolean;
  /** Global first approved leap on this challenge day (not per-user first post). */
  isFirstPostOfDay: boolean;
  /** From bonus recording purchase — reduces nominal base before streak (5→0, 10→5). */
  baseInchesReduction?: number;
  /** Non-owner engagement only. */
  likes: number;
  comments: number;
  shares: number;
  views: number;
};

export type PostLeapInchesBreakdown = {
  nominalBaseInches: number;
  baseInchesReduction: number;
  baseInches: number;
  streakMultiplier: number;
  baseAfterStreak: number;
  engagementInches: number;
  leapInches: number;
};

export function computePostLeapInches(input: PostLeapInchesInput): PostLeapInchesBreakdown {
  let nominalBase = LEAP_BASE_INCHES;
  if (input.isFirstEverLeap || input.isFirstPostOfDay) {
    nominalBase = LEAP_FIRST_BONUS_BASE_INCHES;
  }
  const reduction = Math.max(
    0,
    Math.min(nominalBase, Number(input.baseInchesReduction ?? 0))
  );
  const base = Math.max(0, nominalBase - reduction);
  const mult = streakMultiplierForDays(input.streakDays);
  const baseAfterStreak = base * mult;
  const engagementInches =
    Math.max(0, input.likes) * 1 +
    Math.max(0, input.comments) * 2 +
    Math.max(0, input.shares) * 3 +
    Math.max(0, input.views) * 0.5;
  const leapInches = Math.round((baseAfterStreak + engagementInches) * 10) / 10;
  return {
    nominalBaseInches: nominalBase,
    baseInchesReduction: reduction,
    baseInches: base,
    streakMultiplier: mult,
    baseAfterStreak,
    engagementInches,
    leapInches: Math.max(0, leapInches),
  };
}

export function roundLeapDisplayInches(inches: number): number {
  return Math.max(0, Math.round(Number(inches ?? 0)));
}

/** Display formatting for cumulative / board totals. */
export function formatLeapInchesDisplay(totalInches: number): string {
  const n = roundLeapDisplayInches(totalInches);
  if (n >= 12_000) {
    return `${Math.round(n / 36)} yd`;
  }
  if (n >= 100) {
    const feet = Math.floor(n / 12);
    const rem = n - feet * 12;
    return `${feet}'${rem}"`;
  }
  return `${n} in`;
}

/** Daily / weekly gain line (e.g. "+18 in"). */
export function formatLeapGainDisplay(inches: number): string {
  return `+${roundLeapDisplayInches(inches)} in`;
}

export function cumulativeInchesFromUser(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const lp = Number(data.leaperLifetimePoints);
  if (Number.isFinite(lp) && lp >= 0) return lp;
  return 0;
}

export function dailyGainInchesFromUser(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const dp = Number(data.leaperDayPoints ?? 0);
  return Number.isFinite(dp) && dp >= 0 ? Math.max(0, dp) : 0;
}

export function weeklyGainInchesFromUser(
  data: Record<string, unknown> | undefined,
  weekKey?: string
): number {
  if (!data) return 0;
  const storedKey = String(data.leaperWeekKey ?? '').trim();
  if (weekKey && storedKey && storedKey !== weekKey) return 0;
  const wp = Number(data.leaperWeekPoints ?? 0);
  return Number.isFinite(wp) && wp > 0 ? wp : 0;
}

export function priorWeekGainInchesFromUser(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const pp = Number(data.leaperPriorWeekPoints ?? 0);
  return Number.isFinite(pp) && pp > 0 ? pp : 0;
}

/** % growth current week vs prior Sun–Sat week (for Most Improved). */
export function weekOverWeekGrowthPct(current: number, prior: number): number {
  const c = Math.max(0, Number(current ?? 0));
  const p = Math.max(0, Number(prior ?? 0));
  if (p <= 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
}

export function isAwardedLeapVideo(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.leapInchesAwarded === true) return true;
  return data.awardedVerticalXP === true;
}

export function leapInchesFromVideo(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  if (String(data.moderationStatus ?? '') === 'nulled') return 0;
  const li = Number(data.leapInches);
  if (Number.isFinite(li) && li >= 0) return li;
  return 0;
}

export function countsForStreak(data: Record<string, unknown> | undefined): boolean {
  if (!data || data.deleted === true) return false;
  const status = String(data.moderationStatus ?? '');
  if (status === 'nulled') return false;
  return status === 'approved' && isAwardedLeapVideo(data);
}

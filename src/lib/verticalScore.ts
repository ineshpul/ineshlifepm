import { normalizeWeekKey } from './getCurrentWeekKey';

/**
 * Leap vertical scoring — inches only (mirrors `functions/src/verticalScoreEngine.ts`).
 */

export const LEAP_BASE_INCHES = 5;
export const LEAP_FIRST_BONUS_BASE_INCHES = 10;
/** Confirming a Co-Leap (invitee) — flat base; poster still gets full solo inches. */
export const CO_LEAP_INVITEE_BASE_INCHES = 3;
export const BONUS_ATTEMPT_BASE_REDUCTION_INCHES = 2;

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function streakMultiplierForDays(streakDays: number): number {
  const s = Math.max(0, Math.floor(Number(streakDays ?? 0)));
  if (s >= 30) return 1.5;
  if (s >= 14) return 1.4;
  if (s >= 7) return 1.25;
  if (s >= 2) return 1.1;
  return 1;
}

export const STREAK_MULTIPLIER_TIERS = [
  { minDays: 30, multiplier: 1.5 },
  { minDays: 14, multiplier: 1.4 },
  { minDays: 7, multiplier: 1.25 },
  { minDays: 2, multiplier: 1.1 },
] as const;

export function formatStreakMultiplierDisplay(multiplier: number): string {
  const m = Number(multiplier);
  if (!Number.isFinite(m) || m <= 1) return '1×';
  const label = Number.isInteger(m) ? String(m) : String(Math.round(m * 100) / 100);
  return `${label}×`;
}

export function nextStreakMultiplierMilestone(streakDays: number): {
  targetDays: number;
  multiplier: number;
  daysRemaining: number;
} | null {
  const s = Math.max(0, Math.floor(Number(streakDays ?? 0)));
  if (s >= 30) return null;
  if (s >= 14) return { targetDays: 30, multiplier: 1.5, daysRemaining: 30 - s };
  if (s >= 7) return { targetDays: 14, multiplier: 1.4, daysRemaining: 14 - s };
  if (s >= 2) return { targetDays: 7, multiplier: 1.25, daysRemaining: 7 - s };
  return { targetDays: 2, multiplier: 1.1, daysRemaining: Math.max(1, 2 - s) };
}

export function formatLeaderboardStreakDays(streakDays: number): string {
  const s = Math.max(0, Math.floor(Number(streakDays ?? 0)));
  if (s <= 0) return '';
  return s === 1 ? '1 day' : `${s} days`;
}

export type PostLeapInchesInput = {
  streakDays: number;
  isFirstEverLeap: boolean;
  /** Global first approved leap on this challenge day (10 in base). */
  isFirstPostOfDay: boolean;
  baseInchesReduction?: number;
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

function engagementInchesFromCounts(input: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}): number {
  return (
    Math.max(0, input.likes) * 1 +
    Math.max(0, input.comments) * 2 +
    Math.max(0, input.shares) * 3 +
    Math.max(0, input.views) * 0.5
  );
}

export function computePostLeapInches(input: PostLeapInchesInput): PostLeapInchesBreakdown {
  let nominalBase = LEAP_BASE_INCHES;
  if (input.isFirstEverLeap || input.isFirstPostOfDay) {
    nominalBase = LEAP_FIRST_BONUS_BASE_INCHES;
  }
  const reduction = Math.max(0, Math.min(nominalBase, Number(input.baseInchesReduction ?? 0)));
  const base = Math.max(0, nominalBase - reduction);
  const mult = streakMultiplierForDays(input.streakDays);
  const baseAfterStreak = base * mult;
  const engagementInches = engagementInchesFromCounts(input);
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

/** Invitee Co-Leap confirm: flat 3in + engagement (poster keeps full solo award). */
export function computeCoLeapInviteeInches(input: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}): PostLeapInchesBreakdown {
  const engagementInches = engagementInchesFromCounts(input);
  const leapInches = Math.round((CO_LEAP_INVITEE_BASE_INCHES + engagementInches) * 10) / 10;
  return {
    nominalBaseInches: CO_LEAP_INVITEE_BASE_INCHES,
    baseInchesReduction: 0,
    baseInches: CO_LEAP_INVITEE_BASE_INCHES,
    streakMultiplier: 1,
    baseAfterStreak: CO_LEAP_INVITEE_BASE_INCHES,
    engagementInches,
    leapInches: Math.max(0, leapInches),
  };
}

/** Preview leap base after a bonus recording purchase (before streak / engagement). */
export function previewLeapBaseAfterBonusPurchase(args: {
  isFirstEverLeap?: boolean;
  isFirstPostOfDay?: boolean;
}): { nominal: number; afterReduction: number } {
  let nominal = LEAP_BASE_INCHES;
  if (args.isFirstEverLeap || args.isFirstPostOfDay) {
    nominal = LEAP_FIRST_BONUS_BASE_INCHES;
  }
  return {
    nominal,
    afterReduction: Math.max(0, nominal - BONUS_ATTEMPT_BASE_REDUCTION_INCHES),
  };
}

/** Round to nearest whole inch for all display formatting. */
export function roundLeapDisplayInches(inches: number): number {
  return Math.max(0, Math.round(Number(inches ?? 0)));
}

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

export function formatLeapGainDisplay(inches: number): string {
  return `+${roundLeapDisplayInches(inches)} in`;
}

export function formatLeapGainTodayBanner(inches: number): string {
  return `${formatLeapGainDisplay(inches)} today`;
}

/** Highest-leap sheet: “Jumped 26 in that day”, “Jumped 32'5" that day”, etc. */
export function formatJumpedThatDay(inches: number): string {
  return `Jumped ${formatLeapInchesDisplay(inches)} that day`;
}

export function cumulativeLeapInchesFromUser(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const lp = Number(data.leaperLifetimePoints);
  return Number.isFinite(lp) && lp >= 0 ? lp : 0;
}

export function dailyLeapInchesFromUser(
  data: Record<string, unknown> | undefined,
  dayKey?: string
): number {
  if (!data) return 0;
  const storedKey = String(data.leaperDayKey ?? '').trim();
  if (dayKey && storedKey && storedKey !== dayKey) return 0;
  const dp = Number(data.leaperDayPoints ?? 0);
  return Number.isFinite(dp) && dp >= 0 ? Math.max(0, dp) : 0;
}

export function weeklyLeapInchesFromUser(
  data: Record<string, unknown> | undefined,
  weekKey?: string
): number {
  if (!data) return 0;
  const storedKey = normalizeWeekKey(String(data.leaperWeekKey ?? ''));
  const wk = weekKey ? normalizeWeekKey(weekKey) : '';
  if (wk && storedKey && storedKey !== wk) return 0;
  const wp = Number(data.leaperWeekPoints ?? 0);
  return Number.isFinite(wp) && wp >= 0 ? Math.max(0, wp) : 0;
}

export function priorWeekLeapInchesFromUser(
  data: Record<string, unknown> | undefined,
  expectedPriorWeekKey?: string
): number {
  if (!data) return 0;
  if (expectedPriorWeekKey) {
    const stored = normalizeWeekKey(String(data.leaperPriorWeekKey ?? ''));
    const expected = normalizeWeekKey(expectedPriorWeekKey);
    if (stored && expected && stored !== expected) return 0;
  }
  const pp = Number(data.leaperPriorWeekPoints ?? 0);
  return Number.isFinite(pp) && pp > 0 ? pp : 0;
}

export function weekOverWeekGrowthPct(current: number, prior: number): number {
  const c = Math.max(0, Number(current ?? 0));
  const p = Math.max(0, Number(prior ?? 0));
  if (p <= 0) return 0;
  return ((c - p) / p) * 100;
}

export function highestDayLeapInchesFromUser(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const h = Number(data.highestDayLeapInches ?? data.highestJumpDisplayInches ?? 0);
  return Number.isFinite(h) && h > 0 ? h : 0;
}

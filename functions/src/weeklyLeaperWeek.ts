/**
 * Weekly leaperboard helpers — week keys come from {@link getCurrentWeekKey} only.
 */
import {
  challengeDateBelongsToWeek,
  getCurrentWeekKey,
  getCurrentWeekKeyFromMs,
  getPriorWeekKey,
  leapWeekChallengeDateKeys,
  msUntilNextWeekReset,
  normalizeWeekKey,
  NY_LEAP_TIMEZONE,
  weekKeyToUtcMs,
  weekStartKeyFromChallengeDate,
} from './getCurrentWeekKey';

export {
  NY_LEAP_TIMEZONE as NY_TIMEZONE,
  challengeDateBelongsToWeek,
  getCurrentWeekKey,
  getCurrentWeekKeyFromMs,
  getPriorWeekKey as priorNyWeekStartKey,
  leapWeekChallengeDateKeys,
  msUntilNextWeekReset,
  normalizeWeekKey as normalizeNyDateKey,
  weekKeyToUtcMs as weekStartKeyToUtcMs,
  weekStartKeyFromChallengeDate,
};

/** @deprecated Use {@link getCurrentWeekKeyFromMs} */
export const currentNyWeekStartKey = getCurrentWeekKeyFromMs;

export type WeeklyLeaperFields = {
  leaperWeekKey: string;
  leaperWeekPoints: number;
  leaperPriorWeekKey: string;
  leaperPriorWeekPoints: number;
};

export function computeWeeklyLeaperFields(
  stored: Record<string, unknown> | undefined,
  weekKeyNow: string,
  weekKeyAward: string,
  inchDelta: number
): WeeklyLeaperFields {
  const d = stored ?? {};
  const storedKey = normalizeWeekKey(String(d.leaperWeekKey ?? ''));
  const nowKey = normalizeWeekKey(weekKeyNow);

  let weekPoints = Math.max(0, Number(d.leaperWeekPoints ?? 0));
  let priorPoints = Math.max(0, Number(d.leaperPriorWeekPoints ?? 0));
  let priorKey = normalizeWeekKey(String(d.leaperPriorWeekKey ?? ''));

  if (storedKey && storedKey !== nowKey) {
    priorPoints = weekPoints;
    priorKey = storedKey;
    weekPoints = 0;
  } else if (!storedKey) {
    weekPoints = 0;
  }

  const inch = Math.round(Number(inchDelta ?? 0) * 10) / 10;
  const awardKey = normalizeWeekKey(weekKeyAward);
  if (inch !== 0 && awardKey === nowKey) {
    weekPoints = Math.max(0, Math.round((weekPoints + inch) * 10) / 10);
  }

  const expectedPrior = getPriorWeekKey(nowKey) ?? '';
  if (expectedPrior && priorKey !== expectedPrior) {
    priorKey = expectedPrior;
  }

  return {
    leaperWeekKey: nowKey,
    leaperWeekPoints: weekPoints,
    leaperPriorWeekKey: priorKey,
    leaperPriorWeekPoints: priorPoints,
  };
}

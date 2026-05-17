/** Streak calendar-day logic (NY leap `challengeDate` keys). */

const MS_PER_DAY = 86400000;

export function leapDateKeyGapDays(olderKey: string, newerKey: string): number {
  const parse = (k: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k).trim());
    if (!m) return NaN;
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const a = parse(olderKey);
  const b = parse(newerKey);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  return Math.max(0, Math.round((b - a) / MS_PER_DAY));
}

/**
 * On a new approved leap day, update streak vs `lastApprovedLeapDateKey`.
 * Missing a day resets multiplier basis to 1 on the next post (gap ≥ 2 → active = 1).
 */
export function updateStreakState(args: {
  lastApprovedLeapDateKey: string;
  newApprovedLeapDayKey: string;
  priorActiveStreak: number;
  priorLongest: number;
}): { activeLeapStreakDays: number; longestLeapStreakDays: number } {
  const last = String(args.lastApprovedLeapDateKey ?? '').trim();
  const next = String(args.newApprovedLeapDayKey ?? '').trim();
  const prior = Math.max(0, Math.floor(Number(args.priorActiveStreak ?? 0)));
  const longest0 = Math.max(0, Math.floor(Number(args.priorLongest ?? 0)));

  if (!last) {
    const active = 1;
    return { activeLeapStreakDays: active, longestLeapStreakDays: Math.max(longest0, active) };
  }
  if (last === next) {
    return { activeLeapStreakDays: prior, longestLeapStreakDays: Math.max(longest0, prior) };
  }
  const gap = leapDateKeyGapDays(last, next);
  let active = prior;
  if (gap === 1) active = prior + 1;
  else if (gap >= 2) active = 1;
  else active = 1;
  return {
    activeLeapStreakDays: active,
    longestLeapStreakDays: Math.max(longest0, active),
  };
}

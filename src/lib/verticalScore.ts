/**
 * Live Vertical Score + lifetime XP (pure math).
 * Server copy: `functions/src/verticalScoreEngine.ts` — keep formulas identical.
 */
import type {
  PostMetricsSnapshot,
  PostVerticalXpBreakdown,
  PostVerticalXpInput,
  VerticalScoreBreakdownFirestore,
  VerticalScoreComputationResult,
} from '../types/verticalScore';

const DIFFICULTY_XP: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 5,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
};

const MS_PER_DAY = 86400000;

const EMPTY_VERTICAL_BREAKDOWN: VerticalScoreBreakdownFirestore = {
  lifetimePower: 0,
  streakPower: 0,
  recentQualityPower: 0,
  inactivityDecay: 0,
  safetyPenalty: 0,
  lifetimeVerticalXP: 0,
  activeLeapStreakDays: 0,
  recentQualityAvg: 0,
};

/**
 * Normalize Firestore `verticalScoreBreakdown` after the live-score remodel.
 * Legacy `{ consistency, engagement, reliability, bonus }` maps to zeros.
 */
export function normalizeVerticalScoreBreakdown(raw: unknown): VerticalScoreBreakdownFirestore {
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_VERTICAL_BREAKDOWN };
  }
  const o = raw as Record<string, unknown>;
  if (
    'lifetimePower' in o ||
    'recentQualityAvg' in o ||
    'activeLeapStreakDays' in o
  ) {
    return {
      lifetimePower: Number(o.lifetimePower ?? 0),
      streakPower: Number(o.streakPower ?? 0),
      recentQualityPower: Number(o.recentQualityPower ?? 0),
      inactivityDecay: Number(o.inactivityDecay ?? 0),
      safetyPenalty: Number(o.safetyPenalty ?? 0),
      lifetimeVerticalXP: Number(o.lifetimeVerticalXP ?? 0),
      activeLeapStreakDays: Number(o.activeLeapStreakDays ?? 0),
      recentQualityAvg: Number(o.recentQualityAvg ?? 0),
    };
  }
  return { ...EMPTY_VERTICAL_BREAKDOWN };
}

export function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

export function computeEngagementUnits(args: {
  likes: number;
  uniqueComments: number;
  commentCountFallback: number;
  shares: number;
  saves: number;
}): number {
  const uc =
    Number.isFinite(args.uniqueComments) && args.uniqueComments > 0
      ? Math.max(0, args.uniqueComments)
      : Math.max(0, args.commentCountFallback);
  return (
    Math.max(0, args.likes) * 1 +
    uc * 2.5 +
    Math.max(0, args.shares) * 4 +
    Math.max(0, args.saves) * 3
  );
}

export function viewsEfficient(args: {
  uniqueViews?: number;
  storedViews?: number;
  views?: number;
}): number {
  const v = Math.max(
    0,
    Number(args.uniqueViews ?? 0),
    Number(args.storedViews ?? 0),
    Number(args.views ?? 0)
  );
  return Math.max(50, v);
}

export function computePostQualityScore(weightedEngagementRate: number): number {
  if (!Number.isFinite(weightedEngagementRate) || weightedEngagementRate <= 0) return 0;
  return clamp(weightedEngagementRate / 0.18, 0, 1);
}

function difficultyUsed(raw: number | undefined): 1 | 2 | 3 | 4 | 5 {
  const d = Math.round(Number(raw));
  if (!Number.isFinite(d)) return 2;
  return clamp(d, 1, 5) as 1 | 2 | 3 | 4 | 5;
}

export function difficultyXpFromLevel(level: number | undefined): number {
  return DIFFICULTY_XP[difficultyUsed(level)];
}

export function engagementXpFromUnits(units: number): number {
  const u = Math.max(0, units);
  return Math.min(25, Math.log2(1 + u) * 4);
}

export function computePostVerticalXP(input: PostVerticalXpInput): PostVerticalXpBreakdown {
  const approvalXP = 20;
  const challengeDifficultyUsed = difficultyUsed(input.challengeDifficulty);
  const difficultyXP = DIFFICULTY_XP[challengeDifficultyUsed];

  const engagementUnits = computeEngagementUnits({
    likes: input.likes,
    uniqueComments: input.uniqueComments,
    commentCountFallback: input.commentCountFallback,
    shares: input.shares,
    saves: input.saves,
  });

  const viewsEff = viewsEfficient({
    uniqueViews: input.uniqueViews,
    storedViews: input.storedViews,
    views: input.views,
  });

  const weightedEngagementRate = engagementUnits / Math.max(viewsEff, 1);
  const qualityScore = computePostQualityScore(weightedEngagementRate);
  const qualityXP = 30 * qualityScore;
  const engagementXP = engagementXpFromUnits(engagementUnits);

  const preStreakXP = approvalXP + difficultyXP + qualityXP;
  const streakDays = Math.max(0, Math.floor(Number(input.activeLeapStreakDays ?? 0)));
  const streakMultiplierBonus = Math.min(0.25, streakDays * 0.015);
  const streakBonusXP = Math.min(15, preStreakXP * streakMultiplierBonus);

  const reports = Math.max(0, Number(input.reports ?? 0));
  const reportRate = reports / Math.max(viewsEff, 50);
  const reportPenalty = Math.min(30, reportRate * 200);
  const suspicious = Math.max(0, Number(input.suspiciousActivityPenalty ?? 0));
  const penaltyXP = reportPenalty + suspicious;

  const firstLeapBonusXP = Math.max(0, Math.round(Number(input.firstLeapBonusXP ?? 0)));
  const firstPostOfDayBonusXP = Math.max(0, Math.round(Number(input.firstPostOfDayBonusXP ?? 0)));

  const postVerticalXP = Math.max(
    0,
    Math.round(
      approvalXP +
        difficultyXP +
        qualityXP +
        engagementXP +
        streakBonusXP +
        firstLeapBonusXP +
        firstPostOfDayBonusXP -
        penaltyXP
    )
  );

  return {
    approvalXP,
    difficultyXP,
    qualityXP,
    engagementXP,
    streakBonusXP,
    firstLeapBonusXP,
    firstPostOfDayBonusXP,
    penaltyXP,
    qualityScore,
    engagementUnits,
    weightedEngagementRate,
    challengeDifficultyUsed,
    postVerticalXP,
  };
}

export function computeLifetimePower(lifetimeVerticalXP: number): number {
  const x = Math.max(0, Number(lifetimeVerticalXP ?? 0));
  return 70 * (1 - Math.exp(-x / 2500));
}

export function computeInactivityDecay(missedDays: number): number {
  const m = Math.max(0, Math.floor(Number(missedDays)));
  const decayDays = Math.max(0, m - 1);
  return Math.min(30, decayDays * 2);
}

export function computeLiveVerticalScore(args: {
  lifetimeVerticalXP: number;
  activeLeapStreakDays: number;
  recentQualityAvg: number;
  inactivityDecay: number;
  safetyPenalty: number;
}): number {
  const lifetimePower = computeLifetimePower(args.lifetimeVerticalXP);
  const streakDays = Math.max(0, Number(args.activeLeapStreakDays ?? 0));
  const streakPower = Math.min(15, streakDays * 1.2);
  const rq = clamp(Number(args.recentQualityAvg ?? 0), 0, 1);
  const recentQualityPower = Math.min(15, rq * 15);
  const inactivityDecay = clamp(Number(args.inactivityDecay ?? 0), 0, 100);
  const safetyPenalty = clamp(Number(args.safetyPenalty ?? 0), 0, 100);
  const raw = lifetimePower + streakPower + recentQualityPower - inactivityDecay - safetyPenalty;
  return clamp(Math.round(raw), 0, 100);
}

export function computeRecentQualityAvg(qualityScores: number[]): number {
  if (!qualityScores.length) return 0;
  const s = qualityScores.reduce((a, b) => a + clamp(Number(b), 0, 1), 0);
  return s / qualityScores.length;
}

/**
 * Calendar day gap between ISO `YYYY-MM-DD` keys (UTC date parts; keys from NY leap logic sort chronologically).
 */
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
 * On a **new** approved leap day `newDayKey`, update streak vs `lastApprovedLeapDateKey`.
 * - Same day as last: no increment (second post).
 * - Consecutive day: +1
 * - Gap 2 days: unchanged
 * - Gap 3+: reset to 1
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
  else if (gap === 2) active = prior;
  else if (gap >= 3) active = 1;
  else active = 1;
  return {
    activeLeapStreakDays: active,
    longestLeapStreakDays: Math.max(longest0, active),
  };
}

/** Game stat inches from best-leap XP (not measured jump height). */
export function bestLeapXpToDisplayInches(bestLeapXP: number): number {
  const xp = Math.max(0, bestLeapXP);
  return clamp(Math.round(4 + xp * 0.32), 0, 48);
}

/** UI: map internal day/lifetime totals to the same inch scale as best leap (game stat). */
export function leaperPointsToDisplayInches(points: number): number {
  return bestLeapXpToDisplayInches(Math.max(0, Number(points ?? 0)));
}

/** UI: leaderboard / profile totals — 0 points shows as 0 in (no artificial floor). */
export function leaperTotalsToDisplayInches(points: number): number {
  const p = Math.max(0, Number(points ?? 0));
  if (p <= 0) return 0;
  return bestLeapXpToDisplayInches(p);
}

/**
 * UI: map live vertical score (0–100) to display inches (game stat, same 0–48 band as other UI).
 * Internal ranking still uses `verticalScore`; this is presentation-only.
 */
export function verticalScoreToDisplayInches(verticalScore: number): number {
  const s = clamp(Number(verticalScore ?? 0), 0, 100);
  return clamp(Math.round(s * 0.48), 0, 48);
}

export function verticalScoreTier(score: number): { label: string; hint: string } {
  const s = clamp(score, 0, 100);
  const inches = verticalScoreToDisplayInches(s);
  if (s >= 72) return { label: 'Top', hint: `You’re at ${inches} in on the board — keep the streak going.` };
  if (s >= 42) return { label: 'Rising', hint: `You’re at ${inches} in. Post and engage to climb.` };
  return { label: 'Solid', hint: `You’re at ${inches} in. Every approved leap helps you rise.` };
}

/**
 * @deprecated Leave-one-out marginal replaced by best post `verticalXP`. Use `bestLeapXpToDisplayInches` + max XP post from Firestore.
 */
export function marginalVerticalGainToDisplayInches(gainPoints: number): number {
  return bestLeapXpToDisplayInches(Math.max(0, gainPoints));
}

/**
 * @deprecated Uses `verticalXP` on snapshots when present; otherwise returns zeros.
 */
export function computeBestPostVerticalMarginal(
  posts: PostMetricsSnapshot[],
  _nowMs: number
): { postId: string | null; gainPoints: number; displayInches: number } {
  const candidates = posts.filter((p) => !p.deleted && (p.verticalXP ?? 0) > 0);
  if (candidates.length === 0) {
    return { postId: null, gainPoints: 0, displayInches: 0 };
  }
  let best = candidates[0]!;
  for (const p of candidates) {
    if ((p.verticalXP ?? 0) > (best.verticalXP ?? 0)) best = p;
  }
  const xp = Math.round(Math.max(0, best.verticalXP ?? 0));
  return { postId: best.postId, gainPoints: xp, displayInches: bestLeapXpToDisplayInches(xp) };
}

/**
 * @deprecated Rolling 14-day model removed. Prefer server `recomputeVerticalScoreCallable`.
 * Rough client preview: sums `verticalXP` on snapshots and estimates live score without streak/decay.
 */
export function computeVerticalScoreFromPosts(
  posts: PostMetricsSnapshot[],
  nowMs: number
): VerticalScoreComputationResult {
  const active = posts.filter((p) => !p.deleted);
  const lifetime = active.reduce((s, p) => s + Math.max(0, Number(p.verticalXP ?? 0)), 0);
  const recent: number[] = [];
  for (const p of active) {
    const ageDays = (nowMs - p.createdAtMs) / MS_PER_DAY;
    if (ageDays >= 0 && ageDays <= 28) {
      const br = computePostVerticalXP({
        likes: p.likes,
        uniqueComments: p.comments,
        commentCountFallback: p.comments,
        shares: p.shares,
        saves: p.saves,
        storedViews: p.views,
        views: p.views,
        reports: p.reports,
        challengeDifficulty: 2,
        activeLeapStreakDays: 0,
        firstLeapBonusXP: 0,
        firstPostOfDayBonusXP: 0,
      });
      recent.push(br.qualityScore);
    }
  }
  const recentQualityAvg = computeRecentQualityAvg(recent);
  const lifetimePower = computeLifetimePower(lifetime);
  const recentQualityPower = Math.min(15, recentQualityAvg * 15);
  const verticalScore = Math.round(
    clamp(lifetimePower + recentQualityPower, 0, 100)
  );
  const breakdown: VerticalScoreBreakdownFirestore = {
    lifetimePower,
    streakPower: 0,
    recentQualityPower,
    inactivityDecay: 0,
    safetyPenalty: 0,
    lifetimeVerticalXP: lifetime,
    activeLeapStreakDays: 0,
    recentQualityAvg,
  };
  return { verticalScore, breakdown };
}

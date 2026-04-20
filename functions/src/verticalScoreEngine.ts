/**
 * Keep formulas in sync with `src/lib/verticalScore.ts` (Expo app).
 * Admin-only path: no client imports from the app bundle.
 */
import type { PostMetricsSnapshot } from './verticalScoreTypes';

export const SCORE_WINDOW_DAYS = 14;
export const RECENCY_HALF_LIFE_DAYS = 7;
export const WEIGHT_CONSISTENCY = 0.4;
export const WEIGHT_ENGAGEMENT = 0.6;
export const ENGAGEMENT_LIKE = 1;
export const ENGAGEMENT_COMMENT = 2;
export const ENGAGEMENT_SHARE = 3;
export const ENGAGEMENT_SAVE = 2;
export const MIN_EFFECTIVE_VIEWS = 12;
export const VIEW_TRUST_K = 38;
export const PER_POST_ENGAGEMENT_RATIO_CAP = 0.55;
export const ENGAGEMENT_RATIO_TARGET = 0.16;
export const CHALLENGE_COMPLETION_BONUS_PER_POST = 1.75;
export const CHALLENGE_BONUS_MAX_POINTS = 12;
export const REPORT_PENALTY_PER_UNIT = 6;
export const REPORT_PENALTY_MAX_POINTS = 28;
export const DELETED_POST_PENALTY = 10;
export const IMPRESSION_PRIOR_FROM_ENGAGEMENT = 9;

const MS_PER_DAY = 86400000;

export const IDEAL_CONSISTENCY_WEIGHT_SUM: number = (() => {
  let s = 0;
  for (let d = 0; d < SCORE_WINDOW_DAYS; d++) {
    s += recencyWeightForAgeDays(d);
  }
  return s;
})();

export function recencyWeightForAgeDays(ageDays: number): number {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  return Math.pow(2, -ageDays / RECENCY_HALF_LIFE_DAYS);
}

function effectiveViews(p: PostMetricsSnapshot): number {
  const stored = Number(p.views);
  const organicFloor =
    IMPRESSION_PRIOR_FROM_ENGAGEMENT + p.likes + p.comments * 2 + p.shares * 2 + p.saves;
  return Math.max(MIN_EFFECTIVE_VIEWS, stored, organicFloor);
}

function trustFromViews(viewsEff: number): number {
  return viewsEff / (viewsEff + VIEW_TRUST_K);
}

function rawEngagementUnits(p: PostMetricsSnapshot): number {
  return (
    p.likes * ENGAGEMENT_LIKE +
    p.comments * ENGAGEMENT_COMMENT +
    p.shares * ENGAGEMENT_SHARE +
    p.saves * ENGAGEMENT_SAVE
  );
}

export function marginalVerticalGainToDisplayInches(gainPoints: number): number {
  const g = Math.max(0, gainPoints);
  return Math.max(0, Math.min(48, Math.round(g * 0.45 + 2)));
}

export function computeBestPostVerticalMarginal(
  posts: PostMetricsSnapshot[],
  nowMs: number
): { postId: string | null; gainPoints: number; displayInches: number } {
  const activeCandidates = posts.filter((p) => {
    if (p.deleted) return false;
    const ageDays = (nowMs - p.createdAtMs) / MS_PER_DAY;
    return ageDays >= 0 && ageDays <= SCORE_WINDOW_DAYS;
  });
  if (activeCandidates.length === 0) {
    return { postId: null, gainPoints: 0, displayInches: 0 };
  }

  const fullScore = computeVerticalScoreFromPosts(posts, nowMs).verticalScore;
  let bestId: string | null = null;
  let bestGain = 0;

  for (const p of activeCandidates) {
    const without = posts.filter((x) => x.postId !== p.postId);
    const withoutScore = computeVerticalScoreFromPosts(without, nowMs).verticalScore;
    const gain = fullScore - withoutScore;
    if (gain > bestGain) {
      bestGain = gain;
      bestId = p.postId;
    }
  }

  const gainPoints = Math.max(0, Math.round(bestGain));
  return {
    postId: bestId,
    gainPoints,
    displayInches: marginalVerticalGainToDisplayInches(bestGain),
  };
}

export function computeVerticalScoreFromPosts(
  posts: PostMetricsSnapshot[],
  nowMs: number
): { verticalScore: number; breakdown: Record<string, number> } {
  const active = posts.filter((p) => !p.deleted);
  const deletedCount = posts.length - active.length;

  if (active.length === 0) {
    return {
      verticalScore: 0,
      breakdown: { consistency: 0, engagement: 0, reliability: 0, bonus: 0 },
    };
  }

  let consistencyWeightSum = 0;
  let engagementWeightedSum = 0;
  let reliabilityWeightedSum = 0;
  let weightSum = 0;
  let bonusPoints = 0;
  let reportUnits = 0;

  for (const p of active) {
    const ageDays = (nowMs - p.createdAtMs) / MS_PER_DAY;
    if (ageDays > SCORE_WINDOW_DAYS) continue;

    const w = recencyWeightForAgeDays(ageDays);
    if (w <= 0) continue;

    const viewsEff = effectiveViews(p);
    const trust = trustFromViews(viewsEff);
    const raw = rawEngagementUnits(p);
    const ratio = raw / Math.max(viewsEff, 1);
    const capped = Math.min(PER_POST_ENGAGEMENT_RATIO_CAP, ratio);
    const quality = capped * trust;

    consistencyWeightSum += w;
    engagementWeightedSum += w * quality;
    reliabilityWeightedSum += w * trust;
    weightSum += w;

    if (p.challengeCompleted) {
      bonusPoints += CHALLENGE_COMPLETION_BONUS_PER_POST * w;
    }
    reportUnits += p.reports * w;
  }

  const consistencyPillar =
    IDEAL_CONSISTENCY_WEIGHT_SUM > 0
      ? Math.min(100, (100 * consistencyWeightSum) / IDEAL_CONSISTENCY_WEIGHT_SUM)
      : 0;

  const reliabilityAvg = weightSum > 0 ? reliabilityWeightedSum / weightSum : 0;
  const engagementBlend = weightSum > 0 ? engagementWeightedSum / weightSum : 0;
  const engagementPillar = Math.min(
    100,
    Math.max(0, (100 * engagementBlend) / ENGAGEMENT_RATIO_TARGET)
  );

  const engagementForFinal = engagementPillar * reliabilityAvg;

  const bonusCapped = Math.min(CHALLENGE_BONUS_MAX_POINTS, bonusPoints);
  const reportPenalty = Math.min(REPORT_PENALTY_MAX_POINTS, reportUnits * REPORT_PENALTY_PER_UNIT);
  const deletedPenalty = deletedCount * DELETED_POST_PENALTY;

  const rawFinal =
    WEIGHT_CONSISTENCY * consistencyPillar +
    WEIGHT_ENGAGEMENT * engagementForFinal +
    bonusCapped -
    reportPenalty -
    deletedPenalty;

  const verticalScore = Math.max(0, Math.min(100, Math.round(rawFinal)));

  const breakdown = {
    consistency: Math.round(Math.min(100, Math.max(0, consistencyPillar))),
    engagement: Math.round(Math.min(100, Math.max(0, engagementForFinal))),
    reliability: Math.round(Math.min(100, Math.max(0, reliabilityAvg * 100))),
    bonus: Math.round(Math.min(100, Math.max(0, bonusCapped * 6.5))),
  };

  return { verticalScore, breakdown };
}

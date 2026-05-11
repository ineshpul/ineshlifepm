import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';

import { incrementLifetimeAndLeaperBoard } from './leaperPoints';
import {
  bestLeapXpToDisplayInches,
  computeInactivityDecay,
  computeLifetimePower,
  computeLiveVerticalScore,
  computePostVerticalXP,
  computeRecentQualityAvg,
  leapDateKeyGapDays,
  updateStreakState,
} from './verticalScoreEngine';
import type { PostMetricsSnapshot, PostVerticalXpInput } from './verticalScoreTypes';
import { leapChallengeDateKeyFromMs } from './timeKeys';
import {
  DAILY_CHALLENGE_STATS_COLLECTION,
  FIRST_LEAP_BONUS_XP,
  FIRST_POST_OF_DAY_BONUS_XP,
} from './verticalXpBonuses';

const REGION = 'us-central1';
const POST_COLLECTION = 'videos';
const SCORE_WRITE_BATCH = 120;
const MS_PER_DAY = 86400000;
const RECENT_QUALITY_DAYS = 28;
const AWARDED_XP_PAGE = 500;

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function windowStartMs28(nowMs: number): number {
  return nowMs - RECENT_QUALITY_DAYS * MS_PER_DAY;
}

async function countUniqueNonOwnerCommenters(
  videoRef: admin.firestore.DocumentReference,
  ownerId: string
): Promise<number> {
  const snap = await videoRef.collection('comments').where('uid', '!=', ownerId).get();
  const uids = new Set(snap.docs.map((d) => String(d.data()?.uid ?? '').trim()).filter(Boolean));
  return uids.size;
}

async function syncNonOwnerUniqueCommentersAfterCommentChange(
  videoRef: admin.firestore.DocumentReference,
  ownerUid: string,
  commenterUid: string,
  added: boolean
): Promise<void> {
  if (!commenterUid || commenterUid === ownerUid) return;
  const col = videoRef.collection('comments');
  if (added) {
    const q = await col.where('uid', '==', commenterUid).limit(2).get();
    if (q.size === 1) {
      await videoRef.update({
        nonOwnerUniqueCommenters: admin.firestore.FieldValue.increment(1),
      });
    }
  } else {
    const q = await col.where('uid', '==', commenterUid).limit(1).get();
    if (q.empty) {
      await videoRef.update({
        nonOwnerUniqueCommenters: admin.firestore.FieldValue.increment(-1),
      });
    }
  }
}

/** Sum `verticalXP` on all awarded+approved posts (pagination-safe). Used when `lifetimeVerticalXP` is missing. */
async function sumAwardedVerticalXpForOwner(
  db: admin.firestore.Firestore,
  ownerId: string
): Promise<number> {
  let total = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(AWARDED_XP_PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.awardedVerticalXP === true && String(data.moderationStatus ?? '') === 'approved') {
        total += Math.max(0, Math.round(Number(data.verticalXP ?? 0)));
      }
    }
    if (snap.size < AWARDED_XP_PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return total;
}

async function findBestAwardedVerticalXpForOwner(
  db: admin.firestore.Firestore,
  ownerId: string
): Promise<{ postId: string | null; gainPoints: number; displayInches: number }> {
  let bestId: string | null = null;
  let bestXp = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(AWARDED_XP_PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      if (data.awardedVerticalXP !== true) continue;
      if (String(data.moderationStatus ?? '') !== 'approved') continue;
      const xp = Math.max(0, Math.round(Number(data.verticalXP ?? 0)));
      if (xp > bestXp) {
        bestXp = xp;
        bestId = d.id;
      }
    }
    if (snap.size < AWARDED_XP_PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  if (!bestId || bestXp <= 0) {
    return { postId: null, gainPoints: 0, displayInches: 0 };
  }
  return {
    postId: bestId,
    gainPoints: bestXp,
    displayInches: bestLeapXpToDisplayInches(bestXp),
  };
}

async function resolveChallengeDifficulty(
  db: admin.firestore.Firestore,
  challengeDate: string,
  videoData: Record<string, unknown>
): Promise<number> {
  const v = Number(videoData.challengeDifficulty);
  if (Number.isFinite(v) && v >= 1 && v <= 5) return v;
  try {
    const snap = await db.doc(`challenges/${challengeDate}`).get();
    const c = Number(snap.data()?.challengeDifficulty ?? snap.data()?.difficulty);
    if (Number.isFinite(c) && c >= 1 && c <= 5) return c;
  } catch {
    /* noop */
  }
  return 2;
}

async function loadEngagementForXp(
  videoRef: admin.firestore.DocumentReference,
  ownerId: string,
  data: Record<string, unknown>
): Promise<{
  likes: number;
  uniqueComments: number;
  commentFallback: number;
  shares: number;
  saves: number;
  views: number;
  uniqueViews?: number;
  reports: number;
}> {
  const likesCol = videoRef.collection('likes');
  const [likesTotalAgg, selfLikeSnap] = await Promise.all([
    likesCol.count().get(),
    likesCol.doc(ownerId).get(),
  ]);
  let likes = likesTotalAgg.data().count;
  if (selfLikeSnap.exists) likes = Math.max(0, likes - 1);

  const storedUnique = Number(data.nonOwnerUniqueCommenters);
  let uniqueComments = Number.isFinite(storedUnique) ? Math.max(0, Math.floor(storedUnique)) : NaN;
  if (!Number.isFinite(uniqueComments)) {
    uniqueComments = await countUniqueNonOwnerCommenters(videoRef, ownerId);
  }
  const commentFallback = Math.max(0, Math.floor(Number(data.commentsCount ?? 0)));

  return {
    likes,
    uniqueComments,
    commentFallback,
    shares: Math.max(0, Number(data.shareCount ?? data.shares ?? 0)),
    saves: Math.max(0, Number(data.saveCount ?? data.saves ?? 0)),
    views: Math.max(0, Number(data.viewCount ?? data.views ?? 0)),
    uniqueViews: Number(data.uniqueViewCount ?? data.uniqueViews) || undefined,
    reports: Math.max(0, Number(data.reportCount ?? data.reports ?? 0)),
  };
}

function suspiciousPenaltyFromVideo(data: Record<string, unknown>): number {
  const a = Number(data.suspiciousActivityPenalty ?? data.suspiciousScore ?? data.fraudScore ?? 0);
  return Number.isFinite(a) && a > 0 ? Math.min(60, a) : 0;
}

async function awardVerticalXpFirstApproval(
  db: admin.firestore.Firestore,
  videoRef: admin.firestore.DocumentReference,
  videoId: string,
  data: Record<string, unknown>
): Promise<void> {
  const owner = String(data.uid ?? '').trim();
  if (!owner) return;
  const nowMs = Date.now();
  const challengeDate = String(data.challengeDate ?? leapChallengeDateKeyFromMs(nowMs)).trim();
  const eng = await loadEngagementForXp(videoRef, owner, data);
  const difficulty = await resolveChallengeDifficulty(db, challengeDate, data);
  const userRef = db.doc(`users/${owner}`);
  const userSnap = await userRef.get();
  const u = userSnap.data() ?? {};
  const priorStreak = Math.max(0, Math.floor(Number(u.activeLeapStreakDays ?? 0)));
  const priorLongest = Math.max(0, Math.floor(Number(u.longestLeapStreakDays ?? 0)));
  const lastKey = String(u.lastApprovedLeapDateKey ?? '').trim();

  const streakForXp = priorStreak;
  const streakNext = updateStreakState({
    lastApprovedLeapDateKey: lastKey,
    newApprovedLeapDayKey: challengeDate,
    priorActiveStreak: priorStreak,
    priorLongest: priorLongest,
  });

  const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${challengeDate}`);

  const br = await db.runTransaction(async (tx) => {
    const vSnap = await tx.get(videoRef);
    if (!vSnap.exists) return null;
    const vd = vSnap.data() as Record<string, unknown>;
    if (vd.awardedVerticalXP === true) return null;
    if (String(vd.moderationStatus ?? '') !== 'approved') return null;

    const uSnap = await tx.get(userRef);
    const ud = uSnap.data() ?? {};
    const hasFirstLeap = ud.hasReceivedFirstLeapBonus === true;
    const firstLeapBonusXP = hasFirstLeap ? 0 : FIRST_LEAP_BONUS_XP;

    const sSnap = await tx.get(statsRef);
    const sd = sSnap.data() as Record<string, unknown> | undefined;
    const existingWinner = String(sd?.firstPostBonusAwardedPostId ?? '').trim();
    let firstPostOfDayBonusXP = 0;
    if (!existingWinner) {
      firstPostOfDayBonusXP = FIRST_POST_OF_DAY_BONUS_XP;
    } else if (existingWinner === videoId) {
      firstPostOfDayBonusXP = FIRST_POST_OF_DAY_BONUS_XP;
    }

    const xpIn: PostVerticalXpInput = {
      likes: eng.likes,
      uniqueComments: eng.uniqueComments,
      commentCountFallback: eng.commentFallback,
      shares: eng.shares,
      saves: eng.saves,
      reports: eng.reports,
      uniqueViews: eng.uniqueViews,
      storedViews: eng.views,
      views: eng.views,
      challengeDifficulty: difficulty,
      activeLeapStreakDays: streakForXp,
      suspiciousActivityPenalty: suspiciousPenaltyFromVideo(data),
      firstLeapBonusXP,
      firstPostOfDayBonusXP,
    };
    const computed = computePostVerticalXP(xpIn);

    tx.set(
      videoRef,
      {
        verticalXP: computed.postVerticalXP,
        approvalXP: computed.approvalXP,
        difficultyXP: computed.difficultyXP,
        qualityXP: computed.qualityXP,
        engagementXP: computed.engagementXP,
        streakBonusXP: computed.streakBonusXP,
        firstLeapBonusXP: computed.firstLeapBonusXP,
        firstPostOfDayBonusXP: computed.firstPostOfDayBonusXP,
        penaltyXP: computed.penaltyXP,
        qualityScore: computed.qualityScore,
        engagementUnits: computed.engagementUnits,
        weightedEngagementRate: computed.weightedEngagementRate,
        challengeDifficulty: computed.challengeDifficultyUsed,
        challengeCompleted: vd.challengeCompleted !== false,
        moderationStatus: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        verticalXPAwardedAt: admin.firestore.FieldValue.serverTimestamp(),
        awardedVerticalXP: true,
        verticalXpStreakDaysBasis: streakForXp,
        challengeDifficultyUsedForXp: computed.challengeDifficultyUsed,
      },
      { merge: true }
    );

    const userPatch: Record<string, unknown> = {
      activeLeapStreakDays: streakNext.activeLeapStreakDays,
      longestLeapStreakDays: streakNext.longestLeapStreakDays,
      lastApprovedLeapDateKey: challengeDate,
    };
    if (firstLeapBonusXP > 0) {
      userPatch.hasReceivedFirstLeapBonus = true;
    }
    tx.set(userRef, userPatch, { merge: true });

    if (firstPostOfDayBonusXP > 0) {
      tx.set(
        statsRef,
        {
          firstPostBonusAwardedPostId: videoId,
          firstPostBonusAwardedUserId: owner,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return computed;
  });

  if (!br) return;

  await incrementLifetimeAndLeaperBoard(db, owner, br.postVerticalXP, nowMs, nowMs);

  try {
    await recomputeVerticalScoreAdmin(owner);
  } catch (e) {
    logger.error('recompute after award failed', { owner, videoId, e });
  }
}

async function clearFirstPostOfDayStatsIfWinner(
  db: admin.firestore.Firestore,
  challengeDate: string,
  videoId: string
): Promise<void> {
  const key = String(challengeDate ?? '').trim();
  if (!key) return;
  const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${key}`);
  const st = await statsRef.get();
  if (!st.exists) return;
  const wid = String(st.data()?.firstPostBonusAwardedPostId ?? '').trim();
  if (wid === videoId) {
    await statsRef.set(
      {
        firstPostBonusAwardedPostId: admin.firestore.FieldValue.delete(),
        firstPostBonusAwardedUserId: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
  }
}

async function revokeVerticalXpForVideo(
  db: admin.firestore.Firestore,
  videoRef: admin.firestore.DocumentReference,
  videoId: string,
  beforeData: Record<string, unknown>
): Promise<void> {
  const owner = String(beforeData.uid ?? '').trim();
  if (!owner || beforeData.awardedVerticalXP !== true) return;
  const xp = Math.max(0, Math.round(Number(beforeData.verticalXP ?? 0)));
  if (xp <= 0) return;
  const awardMs = toMillis(beforeData.verticalXPAwardedAt ?? beforeData.approvedAt ?? beforeData.createdAt);
  const nowMs = Date.now();
  const hadFirstLeap = Math.max(0, Math.round(Number(beforeData.firstLeapBonusXP ?? 0))) > 0;
  const challengeDate = String(beforeData.challengeDate ?? '').trim();

  await incrementLifetimeAndLeaperBoard(db, owner, -xp, awardMs > 0 ? awardMs : nowMs, nowMs);

  if (hadFirstLeap) {
    await db.doc(`users/${owner}`).set({ hasReceivedFirstLeapBonus: false }, { merge: true });
  }
  if (Math.max(0, Math.round(Number(beforeData.firstPostOfDayBonusXP ?? 0))) > 0 && challengeDate) {
    await clearFirstPostOfDayStatsIfWinner(db, challengeDate, videoId);
  }

  await videoRef.set(
    {
      awardedVerticalXP: false,
      verticalXPRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
      verticalXP: 0,
      penaltyXP: 0,
      streakBonusXP: 0,
      engagementXP: 0,
      qualityXP: 0,
      difficultyXP: 0,
      approvalXP: 0,
      firstLeapBonusXP: 0,
      firstPostOfDayBonusXP: 0,
    },
    { merge: true }
  );
  try {
    await recomputeVerticalScoreAdmin(owner);
  } catch (e) {
    logger.error('recompute after revoke failed', { owner, videoId, e });
  }
}

/**
 * Recompute `verticalXP` and breakdown for an already-awarded video (e.g. engagement deltas or backfill).
 * Applies optional forced bonus amounts; defaults preserve stored `firstLeapBonusXP` / `firstPostOfDayBonusXP`.
 */
export async function adminRetotalAwardedVideoXp(
  db: admin.firestore.Firestore,
  videoId: string,
  opts?: { forcedFirstLeap?: number; forcedFirstPost?: number }
): Promise<{ delta: number }> {
  const videoRef = db.doc(`${POST_COLLECTION}/${videoId}`);
  const snap = await videoRef.get();
  if (!snap.exists) return { delta: 0 };
  const data = snap.data() as Record<string, unknown>;
  if (String(data.moderationStatus ?? '') !== 'approved' || data.awardedVerticalXP !== true) {
    return { delta: 0 };
  }
  const owner = String(data.uid ?? '').trim();
  if (!owner) return { delta: 0 };

  const eng = await loadEngagementForXp(videoRef, owner, data);
  const challengeDate = String(data.challengeDate ?? '');
  const diffUsed = Number(data.challengeDifficultyUsedForXp ?? data.challengeDifficulty);
  let diff = diffUsed;
  if (!Number.isFinite(diff) || diff < 1 || diff > 5) {
    diff = await resolveChallengeDifficulty(db, challengeDate, data);
  }
  const streakBasis = Math.max(0, Math.floor(Number(data.verticalXpStreakDaysBasis ?? 0)));
  const fl =
    opts?.forcedFirstLeap !== undefined
      ? Math.max(0, Math.round(opts.forcedFirstLeap))
      : Math.max(0, Math.round(Number(data.firstLeapBonusXP ?? 0)));
  const fd =
    opts?.forcedFirstPost !== undefined
      ? Math.max(0, Math.round(opts.forcedFirstPost))
      : Math.max(0, Math.round(Number(data.firstPostOfDayBonusXP ?? 0)));

  const br = computePostVerticalXP({
    likes: eng.likes,
    uniqueComments: eng.uniqueComments,
    commentCountFallback: eng.commentFallback,
    shares: eng.shares,
    saves: eng.saves,
    reports: eng.reports,
    uniqueViews: eng.uniqueViews,
    storedViews: eng.views,
    views: eng.views,
    challengeDifficulty: diff,
    activeLeapStreakDays: streakBasis,
    suspiciousActivityPenalty: suspiciousPenaltyFromVideo(data),
    firstLeapBonusXP: fl,
    firstPostOfDayBonusXP: fd,
  });
  const oldXp = Math.max(0, Math.round(Number(data.verticalXP ?? 0)));
  const delta = br.postVerticalXP - oldXp;
  if (delta === 0) {
    await videoRef.set(
      {
        qualityScore: br.qualityScore,
        engagementUnits: br.engagementUnits,
        weightedEngagementRate: br.weightedEngagementRate,
        firstLeapBonusXP: br.firstLeapBonusXP,
        firstPostOfDayBonusXP: br.firstPostOfDayBonusXP,
      },
      { merge: true }
    );
    return { delta: 0 };
  }
  const awardMs = toMillis(data.verticalXPAwardedAt ?? data.approvedAt ?? data.createdAt);
  const nowMs = Date.now();
  await incrementLifetimeAndLeaperBoard(db, owner, delta, awardMs > 0 ? awardMs : nowMs, nowMs);
  await videoRef.set(
    {
      verticalXP: br.postVerticalXP,
      approvalXP: br.approvalXP,
      difficultyXP: br.difficultyXP,
      qualityXP: br.qualityXP,
      engagementXP: br.engagementXP,
      streakBonusXP: br.streakBonusXP,
      firstLeapBonusXP: br.firstLeapBonusXP,
      firstPostOfDayBonusXP: br.firstPostOfDayBonusXP,
      penaltyXP: br.penaltyXP,
      qualityScore: br.qualityScore,
      engagementUnits: br.engagementUnits,
      weightedEngagementRate: br.weightedEngagementRate,
    },
    { merge: true }
  );
  try {
    await recomputeVerticalScoreAdmin(owner);
  } catch {
    /* noop */
  }
  return { delta };
}

export async function maybeRefreshVideoVerticalXpAfterEngagement(videoId: string): Promise<void> {
  try {
    await adminRetotalAwardedVideoXp(admin.firestore(), videoId);
  } catch (e) {
    logger.error('vertical XP engagement refresh failed', { videoId, e });
  }
}

async function buildSnapshotsForOwner(ownerId: string, db: admin.firestore.Firestore): Promise<PostMetricsSnapshot[]> {
  const q = db
    .collection(POST_COLLECTION)
    .where('uid', '==', ownerId)
    .orderBy('createdAt', 'desc')
    .limit(SCORE_WRITE_BATCH);

  const snap = await q.get();
  const now = Date.now();
  const start = windowStartMs28(now);
  const out: PostMetricsSnapshot[] = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (String(data.moderationStatus ?? '') !== 'approved') continue;
    if (data.deleted === true) continue;

    const createdAtMs = toMillis(data.createdAt);
    const effectiveCreated = createdAtMs > 0 ? createdAtMs : now;
    if (effectiveCreated < start) continue;

    const likesCol = d.ref.collection('likes');
    const [likesTotalAgg, selfLikeSnap] = await Promise.all([
      likesCol.count().get(),
      likesCol.doc(ownerId).get(),
    ]);
    let likes = likesTotalAgg.data().count;
    if (selfLikeSnap.exists) likes = Math.max(0, likes - 1);

    const storedUnique = Number(data.nonOwnerUniqueCommenters);
    let comments = Number.isFinite(storedUnique) ? Math.max(0, Math.floor(storedUnique)) : NaN;
    if (!Number.isFinite(comments)) {
      comments = await countUniqueNonOwnerCommenters(d.ref, ownerId);
    }

    const views = Number(data.viewCount ?? data.views ?? 0);
    const shares = Number(data.shareCount ?? data.shares ?? 0);
    const saves = Number(data.saveCount ?? data.saves ?? 0);
    const reports = Number(data.reportCount ?? data.reports ?? 0);
    const deleted = Boolean(data.deleted ?? false);
    const challengeCompleted = data.challengeCompleted !== false;
    const verticalXP = data.awardedVerticalXP === true ? Math.max(0, Number(data.verticalXP ?? 0)) : undefined;
    const challengeDate = String(data.challengeDate ?? '').trim() || undefined;

    out.push({
      postId: d.id,
      ownerId,
      createdAtMs: effectiveCreated,
      challengeDate,
      views,
      likes,
      comments,
      shares,
      saves,
      reports,
      deleted,
      challengeCompleted,
      verticalXP,
    });
  }

  return out;
}

export async function recomputeVerticalScoreAdmin(ownerId: string): Promise<void> {
  if (!ownerId) return;
  const db = admin.firestore();
  const userRef = db.doc(`users/${ownerId}`);
  const userSnap = await userRef.get();
  const adjustment = Number(userSnap.data()?.verticalScoreAdjustment ?? 0);

  const posts = await buildSnapshotsForOwner(ownerId, db);
  const now = Date.now();
  const start28 = windowStartMs28(now);

  let lifetime = Number(userSnap.data()?.lifetimeVerticalXP ?? NaN);
  if (!Number.isFinite(lifetime) || lifetime < 0) {
    lifetime = await sumAwardedVerticalXpForOwner(db, ownerId);
  }

  const qualityScores: number[] = [];
  let recentApprovedLeapCount = 0;
  for (const p of posts) {
    if (p.createdAtMs < start28) continue;
    recentApprovedLeapCount += 1;
    const vid = await db.doc(`${POST_COLLECTION}/${p.postId}`).get();
    const vd = vid.data() as Record<string, unknown> | undefined;
    const storedQs = Number(vd?.qualityScore);
    if (Number.isFinite(storedQs) && storedQs >= 0 && storedQs <= 1) {
      qualityScores.push(storedQs);
    } else {
      const br = computePostVerticalXP({
        likes: p.likes,
        uniqueComments: p.comments,
        commentCountFallback: p.comments,
        shares: p.shares,
        saves: p.saves,
        reports: p.reports,
        storedViews: p.views,
        views: p.views,
        challengeDifficulty: 2,
        activeLeapStreakDays: 0,
        firstLeapBonusXP: 0,
        firstPostOfDayBonusXP: 0,
      });
      qualityScores.push(br.qualityScore);
    }
  }
  const recentQualityAvg = computeRecentQualityAvg(qualityScores);

  const udata = userSnap.data() ?? {};
  let lastKey = String(udata.lastApprovedLeapDateKey ?? '').trim();
  if (!lastKey) {
    let bestKey = '';
    for (const p of posts) {
      const k = String(p.challengeDate ?? '').trim();
      if (!k) continue;
      if (!bestKey || k > bestKey) bestKey = k;
    }
    lastKey = bestKey;
  }

  const todayKey = leapChallengeDateKeyFromMs(now);
  const missedDays = lastKey ? leapDateKeyGapDays(lastKey, todayKey) : 0;
  const inactivityDecay = computeInactivityDecay(missedDays);

  const activeStreak = Math.max(0, Math.floor(Number(udata.activeLeapStreakDays ?? 0)));
  const safetyPenalty = Math.max(0, Number(udata.safetyPenalty ?? 0));

  const rawLive = computeLiveVerticalScore({
    lifetimeVerticalXP: lifetime,
    activeLeapStreakDays: activeStreak,
    recentQualityAvg,
    inactivityDecay,
    safetyPenalty,
  });
  const combinedScore = Math.max(0, Math.round(rawLive + adjustment));

  const best = await findBestAwardedVerticalXpForOwner(db, ownerId);
  const lifetimePower = computeLifetimePower(lifetime);
  const streakPower = Math.min(15, activeStreak * 1.2);
  const recentQualityPower = Math.min(15, recentQualityAvg * 15);

  const breakdown = {
    lifetimePower: Math.round(lifetimePower * 100) / 100,
    streakPower: Math.round(streakPower * 100) / 100,
    recentQualityPower: Math.round(recentQualityPower * 100) / 100,
    inactivityDecay,
    safetyPenalty,
    lifetimeVerticalXP: lifetime,
    activeLeapStreakDays: activeStreak,
    recentQualityAvg,
  };

  const patch: Record<string, unknown> = {
    verticalScore: combinedScore,
    verticalScoreBreakdown: breakdown,
    verticalScoreUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lifetimeVerticalXP: lifetime,
    recentQualityAvg,
    recentApprovedLeapCount,
    inactivityDecay,
    bestVerticalGainPoints: best.gainPoints,
    highestJumpDisplayInches: best.displayInches,
  };
  if (best.postId) patch.bestVerticalGainPostId = best.postId;
  else patch.bestVerticalGainPostId = admin.firestore.FieldValue.delete();

  await userRef.set(patch, { merge: true });
}

async function ownerUidFromVideoId(videoId: string): Promise<string | null> {
  const snap = await admin.firestore().doc(`${POST_COLLECTION}/${videoId}`).get();
  if (!snap.exists) return null;
  const uid = String(snap.data()?.uid ?? '');
  return uid || null;
}

export const onVerticalScoreVideoCreated = onDocumentCreated(
  { document: `${POST_COLLECTION}/{videoId}`, region: REGION },
  async (event) => {
    const uid = String(event.data?.data()?.uid ?? '');
    if (!uid) return;
    try {
      await recomputeVerticalScoreAdmin(uid);
    } catch (e) {
      logger.error('verticalScore recompute failed (video create)', { uid, e });
    }
  }
);

export const onVerticalScoreVideoDeleted = onDocumentDeleted(
  { document: `${POST_COLLECTION}/{videoId}`, region: REGION },
  async (event) => {
    const uid = String(event.data?.data()?.uid ?? '');
    if (!uid) return;
    try {
      await recomputeVerticalScoreAdmin(uid);
    } catch (e) {
      logger.error('verticalScore recompute failed (video delete)', { uid, e });
    }
  }
);

export const onVerticalScoreVideoApprovedLeaper = onDocumentWritten(
  { document: `${POST_COLLECTION}/{videoId}`, region: REGION },
  async (event) => {
    const afterSnap = event.data?.after;
    if (!afterSnap?.exists) return;
    const beforeSnap = event.data?.before;
    const after = afterSnap.data() as Record<string, unknown>;
    const before = beforeSnap?.exists ? (beforeSnap.data() as Record<string, unknown>) : undefined;
    const videoId = String(event.params.videoId ?? '');
    const videoRef = admin.firestore().doc(`${POST_COLLECTION}/${videoId}`);
    const owner = String(after.uid ?? '').trim();
    if (!owner) return;

    if (
      before &&
      String(before.moderationStatus ?? '') === 'approved' &&
      String(after.moderationStatus ?? '') !== 'approved' &&
      before.awardedVerticalXP === true
    ) {
      try {
        await revokeVerticalXpForVideo(admin.firestore(), videoRef, videoId, before);
      } catch (e) {
        logger.warn('revoke vertical XP failed', { videoId, owner, e });
      }
      return;
    }

    if (String(after.moderationStatus ?? '') === 'approved') {
      if (before && String(before.moderationStatus ?? '') === 'approved') {
        /* already approved */
      } else if (after.awardedVerticalXP === true) {
        /* noop */
      } else {
        try {
          await awardVerticalXpFirstApproval(admin.firestore(), videoRef, videoId, after);
        } catch (e) {
          logger.warn('award vertical XP failed', { videoId, owner, e });
        }
        return;
      }
    }

    try {
      await recomputeVerticalScoreAdmin(owner);
    } catch (e) {
      logger.error('verticalScore recompute failed (video write)', { owner, e });
    }
  }
);

export const onVerticalScoreLikeWrite = onDocumentWritten(
  { document: `${POST_COLLECTION}/{videoId}/likes/{likerId}`, region: REGION },
  async (event) => {
    const videoId = event.params.videoId as string;
    const likerId = String(event.params.likerId ?? '');
    const before = event.data?.before?.exists ?? false;
    const after = event.data?.after?.exists ?? false;
    let delta = 0;
    if (!before && after) delta = 1;
    else if (before && !after) delta = -1;
    if (delta !== 0) {
      try {
        await admin.firestore().doc(`${POST_COLLECTION}/${videoId}`).update({
          likesCount: admin.firestore.FieldValue.increment(delta),
        });
      } catch (e) {
        logger.warn('likesCount sync failed', { videoId, e });
      }
    } else {
      return;
    }
    const owner = await ownerUidFromVideoId(videoId);
    if (!owner) return;
    if (likerId && likerId === owner) return;
    try {
      await maybeRefreshVideoVerticalXpAfterEngagement(videoId);
    } catch (e) {
      logger.warn('vertical XP engagement refresh failed (like)', { videoId, e });
    }
  }
);

export const onVerticalScoreCommentWrite = onDocumentWritten(
  { document: `${POST_COLLECTION}/{videoId}/comments/{commentId}`, region: REGION },
  async (event) => {
    const videoId = event.params.videoId as string;
    const snapBefore = event.data?.before;
    const snapAfter = event.data?.after;
    const before = snapBefore?.exists ?? false;
    const after = snapAfter?.exists ?? false;
    let delta = 0;
    if (!before && after) delta = 1;
    else if (before && !after) delta = -1;
    if (delta !== 0) {
      try {
        await admin.firestore().doc(`${POST_COLLECTION}/${videoId}`).update({
          commentsCount: admin.firestore.FieldValue.increment(delta),
        });
      } catch (e) {
        logger.warn('commentsCount sync failed', { videoId, e });
      }
    } else {
      return;
    }
    const owner = await ownerUidFromVideoId(videoId);
    if (!owner) return;
    const videoRef = admin.firestore().doc(`${POST_COLLECTION}/${videoId}`);
    let commenterUid = '';
    if (!before && after) commenterUid = String(snapAfter?.data()?.uid ?? '');
    else if (before && !after) commenterUid = String(snapBefore?.data()?.uid ?? '');
    try {
      if (delta !== 0) {
        await syncNonOwnerUniqueCommentersAfterCommentChange(
          videoRef,
          owner,
          commenterUid,
          !before && after
        );
      }
    } catch (e) {
      logger.warn('nonOwnerUniqueCommenters sync failed', { videoId, e });
    }
    if (commenterUid && commenterUid === owner) return;
    try {
      await maybeRefreshVideoVerticalXpAfterEngagement(videoId);
    } catch (e) {
      logger.warn('vertical XP engagement refresh failed (comment)', { videoId, e });
    }
  }
);

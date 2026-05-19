import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';

import { buildLeaperPointsPatch, incrementUserLeapInches } from './leaperPoints';
import { recomputeUserWeeklyLeaperFields, writeUserWeeklyLeaperFields } from './weeklyLeaperFields';
import {
  computePostLeapInches,
  countsForStreak,
  isAwardedLeapVideo,
  leapInchesFromVideo,
  updateStreakState,
} from './verticalScoreEngine';
import { decrementApprovedPostCountForLeap, incrementApprovedPostCountForLeap } from './dailyChallengeStatsPosts';
import {
  claimGlobalFirstPostOfDayInTransaction,
  handleGlobalFirstPostRemoved,
  resolveGlobalFirstApprovedVideoIdForDay,
} from './leapDayFirstPost';
import { leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';
import { challengeDateKeysForFirestoreIn, leapChallengeDateKeyFromMs } from './timeKeys';

const REGION = 'us-central1';
const POST_COLLECTION = 'videos';
const PAGE = 500;

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function dayKeyVariants(key: string): Set<string> {
  const out = new Set<string>([key]);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(key).trim());
  if (m) {
    const pad = (n: string) => String(Number(n)).padStart(2, '0');
    out.add(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
    out.add(`${m[1]}-${Number(m[2])}-${Number(m[3])}`);
  }
  return out;
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
      await videoRef.update({ nonOwnerUniqueCommenters: admin.firestore.FieldValue.increment(1) });
    }
  } else {
    const q = await col.where('uid', '==', commenterUid).limit(1).get();
    if (q.empty) {
      await videoRef.update({ nonOwnerUniqueCommenters: admin.firestore.FieldValue.increment(-1) });
    }
  }
}

async function countNonOwnerViews(
  videoRef: admin.firestore.DocumentReference,
  ownerId: string
): Promise<number> {
  const snap = await videoRef.collection('viewMarks').get();
  let n = 0;
  for (const d of snap.docs) {
    if (d.id !== ownerId) n += 1;
  }
  return n;
}

async function loadEngagementForLeap(
  videoRef: admin.firestore.DocumentReference,
  ownerId: string,
  data: Record<string, unknown>
): Promise<{ likes: number; comments: number; shares: number; views: number }> {
  const likesCol = videoRef.collection('likes');
  const [likesTotalAgg, selfLikeSnap] = await Promise.all([
    likesCol.count().get(),
    likesCol.doc(ownerId).get(),
  ]);
  let likes = likesTotalAgg.data().count;
  if (selfLikeSnap.exists) likes = Math.max(0, likes - 1);

  const storedUnique = Number(data.nonOwnerUniqueCommenters);
  let comments = Number.isFinite(storedUnique) ? Math.max(0, Math.floor(storedUnique)) : NaN;
  if (!Number.isFinite(comments)) {
    comments = await countUniqueNonOwnerCommenters(videoRef, ownerId);
  }

  const views = await countNonOwnerViews(videoRef, ownerId);

  return {
    likes,
    comments,
    shares: Math.max(0, Number(data.shareCount ?? data.shares ?? 0)),
    views,
  };
}

async function awardLeapInchesFirstApproval(
  db: admin.firestore.Firestore,
  videoRef: admin.firestore.DocumentReference,
  videoId: string,
  data: Record<string, unknown>
): Promise<void> {
  const owner = String(data.uid ?? '').trim();
  if (!owner) return;
  const nowMs = Date.now();
  const videoChallengeDate = String(data.challengeDate ?? '').trim();
  const challengeDate = videoChallengeDate || leapChallengeDateKeyFromMs(nowMs);
  const eng = await loadEngagementForLeap(videoRef, owner, data);
  const userRef = db.doc(`users/${owner}`);
  const attemptRef = db.doc(`postAttempts/${owner}_${challengeDate}`);
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, nowMs);
  const dayStatsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);

  const br = await db.runTransaction(async (tx) => {
    const vSnap = await tx.get(videoRef);
    if (!vSnap.exists) return null;
    const vd = vSnap.data() as Record<string, unknown>;
    if (isAwardedLeapVideo(vd)) return null;
    if (String(vd.moderationStatus ?? '') !== 'approved') return null;

    const uSnap = await tx.get(userRef);
    const ud = uSnap.data() ?? {};
    const hasEver = ud.hasApprovedLeapEver === true;

    const attSnap = await tx.get(attemptRef);
    const dayStatsSnap = await tx.get(dayStatsRef);
    const baseReduction = Math.max(
      0,
      Number(vd.leapBaseReductionInches ?? attSnap.data()?.leapBaseReductionInches ?? 0)
    );

    const isGlobalFirstOfDay = claimGlobalFirstPostOfDayInTransaction({
      tx,
      statsRef: dayStatsRef,
      statsSnap: dayStatsSnap,
      videoId,
      ownerUid: owner,
      challengeDate,
    });

    const priorStreak = Math.max(0, Math.floor(Number(ud.activeLeapStreakDays ?? 0)));
    const priorLongest = Math.max(0, Math.floor(Number(ud.longestLeapStreakDays ?? 0)));
    const lastKey = String(ud.lastApprovedLeapDateKey ?? '').trim();

    const computed = computePostLeapInches({
      streakDays: priorStreak,
      isFirstEverLeap: !hasEver,
      isFirstPostOfDay: isGlobalFirstOfDay,
      baseInchesReduction: baseReduction,
      likes: eng.likes,
      comments: eng.comments,
      shares: eng.shares,
      views: eng.views,
    });

    const streakNext = updateStreakState({
      lastApprovedLeapDateKey: lastKey,
      newApprovedLeapDayKey: challengeDate,
      priorActiveStreak: priorStreak,
      priorLongest: priorLongest,
    });

    tx.set(
      videoRef,
      {
        leapInches: computed.leapInches,
        leapNominalBaseInches: computed.nominalBaseInches,
        leapBaseReductionInches: computed.baseInchesReduction,
        leapBaseInches: computed.baseInches,
        leapStreakMultiplier: computed.streakMultiplier,
        leapEngagementInches: computed.engagementInches,
        leapInchesAwarded: true,
        leapInchesAwardedAt: admin.firestore.FieldValue.serverTimestamp(),
        leapStreakDaysBasis: priorStreak,
        leapWasFirstEver: !hasEver,
        leapWasGlobalFirstPostOfDay: isGlobalFirstOfDay,
        /** @deprecated Use leapWasGlobalFirstPostOfDay — kept for legacy readers. */
        leapWasFirstPostOfDay: isGlobalFirstOfDay,
        moderationStatus: 'approved',
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        awardedVerticalXP: true,
        verticalXP: 0,
      },
      { merge: true }
    );

    const leaperPatch = buildLeaperPointsPatch(ud, computed.leapInches, challengeDate, nowMs);

    tx.set(
      userRef,
      {
        activeLeapStreakDays: streakNext.activeLeapStreakDays,
        longestLeapStreakDays: streakNext.longestLeapStreakDays,
        lastApprovedLeapDateKey: challengeDate,
        hasApprovedLeapEver: true,
        ...leaperPatch,
      },
      { merge: true }
    );

    return computed;
  });

  if (!br) return;

  try {
    await writeUserWeeklyLeaperFields(db, owner, nowMs);
  } catch (e) {
    logger.error('weekly leaper sync after award failed', { owner, videoId, e });
  }
  try {
    await recomputeUserLeapStatsAdmin(owner);
  } catch (e) {
    logger.error('recompute after award failed', { owner, videoId, e });
  }
}

async function revokeLeapInchesForVideo(
  db: admin.firestore.Firestore,
  videoRef: admin.firestore.DocumentReference,
  videoId: string,
  beforeData: Record<string, unknown>,
  revertStreak: boolean
): Promise<void> {
  const owner = String(beforeData.uid ?? '').trim();
  if (!owner || !isAwardedLeapVideo(beforeData)) return;
  const inches = leapInchesFromVideo(beforeData);
  if (inches <= 0) return;

  const awardMs = toMillis(beforeData.leapInchesAwardedAt ?? beforeData.approvedAt ?? beforeData.createdAt);
  const nowMs = Date.now();
  const challengeDate = String(beforeData.challengeDate ?? '').trim();
  const dayKey = challengeDate || leapChallengeDateKeyFromMs(awardMs > 0 ? awardMs : nowMs);
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(dayKey, awardMs > 0 ? awardMs : nowMs);

  await incrementUserLeapInches(db, owner, -inches, dayKey, awardMs > 0 ? awardMs : nowMs, nowMs);

  try {
    await decrementApprovedPostCountForLeap(db, beforeData, videoId);
  } catch (e) {
    logger.warn('dailyChallengeStats approvedPostCount decrement failed', { videoId, e });
  }

  await videoRef.set(
    {
      leapInchesAwarded: false,
      leapInchesRevokedAt: admin.firestore.FieldValue.serverTimestamp(),
      leapInches: 0,
      leapEngagementInches: 0,
      awardedVerticalXP: false,
      verticalXP: 0,
    },
    { merge: true }
  );

  if (revertStreak) {
    /* Streak is not reverted for null/reject per product spec. */
  }

  try {
    await recomputeUserLeapStatsAdmin(owner);
  } catch (e) {
    logger.error('recompute after revoke failed', { owner, videoId, e });
  }
}

export async function adminRetotalAwardedVideoLeapInches(
  db: admin.firestore.Firestore,
  videoId: string
): Promise<{ delta: number }> {
  const videoRef = db.doc(`${POST_COLLECTION}/${videoId}`);
  const snap = await videoRef.get();
  if (!snap.exists) return { delta: 0 };
  const data = snap.data() as Record<string, unknown>;
  if (String(data.moderationStatus ?? '') !== 'approved' || !isAwardedLeapVideo(data)) {
    return { delta: 0 };
  }
  const owner = String(data.uid ?? '').trim();
  if (!owner) return { delta: 0 };

  const eng = await loadEngagementForLeap(videoRef, owner, data);
  const challengeDate = String(data.challengeDate ?? '');
  const streakBasis = Math.max(0, Math.floor(Number(data.leapStreakDaysBasis ?? 0)));
  const isFirstEver = data.leapWasFirstEver === true;
  const globalFirstId = await resolveGlobalFirstApprovedVideoIdForDay(db, challengeDate);
  const isGlobalFirstOfDay = globalFirstId === videoId;
  const baseReduction = Math.max(0, Number(data.leapBaseReductionInches ?? 0));

  const br = computePostLeapInches({
    streakDays: streakBasis,
    isFirstEverLeap: isFirstEver,
    isFirstPostOfDay: isGlobalFirstOfDay,
    baseInchesReduction: baseReduction,
    likes: eng.likes,
    comments: eng.comments,
    shares: eng.shares,
    views: eng.views,
  });

  const oldInches = leapInchesFromVideo(data);
  const delta = Math.round((br.leapInches - oldInches) * 10) / 10;
  if (delta === 0) {
    await videoRef.set(
      {
        leapEngagementInches: br.engagementInches,
        leapNominalBaseInches: br.nominalBaseInches,
        leapBaseReductionInches: br.baseInchesReduction,
        leapBaseInches: br.baseInches,
        leapStreakMultiplier: br.streakMultiplier,
        leapWasGlobalFirstPostOfDay: isGlobalFirstOfDay,
        leapWasFirstPostOfDay: isGlobalFirstOfDay,
      },
      { merge: true }
    );
    return { delta: 0 };
  }

  const awardMs = toMillis(data.leapInchesAwardedAt ?? data.approvedAt ?? data.createdAt);
  const nowMs = Date.now();
  const dayKey = challengeDate || leapChallengeDateKeyFromMs(awardMs > 0 ? awardMs : nowMs);
  await incrementUserLeapInches(db, owner, delta, dayKey, awardMs > 0 ? awardMs : nowMs, nowMs);
  await videoRef.set(
    {
      leapInches: br.leapInches,
      leapEngagementInches: br.engagementInches,
      leapNominalBaseInches: br.nominalBaseInches,
      leapBaseReductionInches: br.baseInchesReduction,
      leapBaseInches: br.baseInches,
      leapStreakMultiplier: br.streakMultiplier,
      leapWasGlobalFirstPostOfDay: isGlobalFirstOfDay,
      leapWasFirstPostOfDay: isGlobalFirstOfDay,
    },
    { merge: true }
  );
  try {
    await recomputeUserLeapStatsAdmin(owner);
  } catch {
    /* noop */
  }
  return { delta };
}

export async function maybeRefreshVideoLeapInchesAfterEngagement(videoId: string): Promise<void> {
  try {
    await adminRetotalAwardedVideoLeapInches(admin.firestore(), videoId);
  } catch (e) {
    logger.error('leap inches engagement refresh failed', { videoId, e });
  }
}

async function sumLeapInchesForOwner(
  db: admin.firestore.Firestore,
  ownerId: string,
  filter?: (data: Record<string, unknown>) => boolean
): Promise<number> {
  let total = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      if (String(data.moderationStatus ?? '') !== 'approved') continue;
      if (!isAwardedLeapVideo(data)) continue;
      if (filter && !filter(data)) continue;
      total += leapInchesFromVideo(data);
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return Math.round(total * 10) / 10;
}

async function maxDayLeapInchesForOwner(db: admin.firestore.Firestore, ownerId: string): Promise<number> {
  const byDay = new Map<string, number>();
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!countsForStreak(data) || !isAwardedLeapVideo(data)) continue;
      const k = String(data.challengeDate ?? '').trim();
      if (!k) continue;
      byDay.set(k, (byDay.get(k) ?? 0) + leapInchesFromVideo(data));
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  let max = 0;
  for (const v of byDay.values()) max = Math.max(max, v);
  return Math.round(max * 10) / 10;
}

async function rebuildStreakFromVideos(
  db: admin.firestore.Firestore,
  ownerId: string
): Promise<{ active: number; longest: number; lastKey: string }> {
  const days: string[] = [];
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'asc')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!countsForStreak(data)) continue;
      const k = String(data.challengeDate ?? '').trim();
      if (k && !days.includes(k)) days.push(k);
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  days.sort();
  let active = 0;
  let longest = 0;
  let lastKey = '';
  for (const k of days) {
    const next = updateStreakState({
      lastApprovedLeapDateKey: lastKey,
      newApprovedLeapDayKey: k,
      priorActiveStreak: active,
      priorLongest: longest,
    });
    active = next.activeLeapStreakDays;
    longest = next.longestLeapStreakDays;
    lastKey = k;
  }
  return { active, longest, lastKey };
}

/** One-time per recompute: materialize `leapInches` on legacy `awardedVerticalXP` videos. */
async function migrateLegacyAwardedVideosToLeapInches(
  db: admin.firestore.Firestore,
  ownerId: string
): Promise<void> {
  let snap: admin.firestore.QuerySnapshot;
  try {
    snap = await db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .where('awardedVerticalXP', '==', true)
      .limit(40)
      .get();
  } catch {
    return;
  }
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (Number(data.leapInches ?? 0) > 0 && data.leapInchesAwarded === true) continue;
    try {
      await adminRetotalAwardedVideoLeapInches(db, d.id);
    } catch {
      /* skip single video */
    }
  }
}

/** Re-score every awarded video for a leap day (e.g. after global first post is reassigned). */
export async function retotalAllAwardedVideosForLeapDay(
  db: admin.firestore.Firestore,
  challengeDate: string
): Promise<string[]> {
  const dayNorm = leapDayKeyFromStoredChallengeDate(challengeDate);
  const inKeys = challengeDateKeysForFirestoreIn([challengeDate]).slice(0, 30);
  if (!inKeys.length) return [];

  const snap = await db
    .collection(POST_COLLECTION)
    .where('challengeDate', 'in', inKeys)
    .where('moderationStatus', '==', 'approved')
    .limit(120)
    .get();

  const retotaled: string[] = [];
  const owners = new Set<string>();
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.deleted === true) continue;
    if (!isAwardedLeapVideo(data)) continue;
    const cd = leapDayKeyFromStoredChallengeDate(String(data.challengeDate ?? ''), Date.now());
    if (cd !== dayNorm) continue;
    await adminRetotalAwardedVideoLeapInches(db, d.id);
    retotaled.push(d.id);
    const owner = String(data.uid ?? '').trim();
    if (owner) owners.add(owner);
  }

  for (const owner of owners) {
    try {
      await recomputeUserLeapStatsAdmin(owner);
    } catch (e) {
      logger.warn('recompute after leap-day retotal failed', { owner, challengeDate, e });
    }
  }

  return retotaled;
}

/** Full user stats recompute from awarded videos (source of truth). */
export async function recomputeUserLeapStatsAdmin(ownerId: string): Promise<void> {
  if (!ownerId) return;
  const db = admin.firestore();
  await migrateLegacyAwardedVideosToLeapInches(db, ownerId);
  const userRef = db.doc(`users/${ownerId}`);
  const now = Date.now();
  const todayKey = leapChallengeDateKeyFromMs(now);
  const todayKeys = dayKeyVariants(todayKey);

  const lifetime = await sumLeapInchesForOwner(db, ownerId);
  const todayDayPoints = await sumLeapInchesForOwner(db, ownerId, (data) => {
    const k = String(data.challengeDate ?? '').trim();
    return todayKeys.has(k);
  });
  const weeklyFields = await recomputeUserWeeklyLeaperFields(db, ownerId, now);
  const highestDay = await maxDayLeapInchesForOwner(db, ownerId);
  const streak = await rebuildStreakFromVideos(db, ownerId);
  const uSnap = await userRef.get();
  const ud = uSnap.data() ?? {};

  const patch: Record<string, unknown> = {
    leaperLifetimePoints: lifetime,
    leaperWeekKey: weeklyFields.leaperWeekKey,
    leaperWeekPoints: weeklyFields.leaperWeekPoints,
    leaperPriorWeekPoints: weeklyFields.leaperPriorWeekPoints,
    leaperPriorWeekKey: weeklyFields.leaperPriorWeekKey,
    highestDayLeapInches: highestDay,
    highestJumpDisplayInches: highestDay,
    activeLeapStreakDays: streak.active,
    longestLeapStreakDays: streak.longest,
    lastApprovedLeapDateKey: streak.lastKey || String(ud.lastApprovedLeapDateKey ?? ''),
    leapStatsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (todayDayPoints > 0) {
    patch.leaperDayKey = todayKey;
    patch.leaperDayPoints = todayDayPoints;
  }

  await userRef.set(patch, { merge: true });
}

/** @deprecated Alias for callers still named recomputeVerticalScoreAdmin */
export const recomputeVerticalScoreAdmin = recomputeUserLeapStatsAdmin;

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
      await recomputeUserLeapStatsAdmin(uid);
    } catch (e) {
      logger.error('leap stats recompute failed (video create)', { uid, e });
    }
  }
);

export const onVerticalScoreVideoDeleted = onDocumentDeleted(
  { document: `${POST_COLLECTION}/{videoId}`, region: REGION },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const videoId = String(event.params.videoId ?? '');
    const uid = String(data?.uid ?? '').trim();
    if (!uid || !data) return;

    const db = admin.firestore();
    const challengeDate = String(data.challengeDate ?? '').trim();
    const wasApproved = String(data.moderationStatus ?? '') === 'approved';

    try {
      if (wasApproved) {
        try {
          await decrementApprovedPostCountForLeap(db, data, videoId);
        } catch (e) {
          logger.warn('approvedPostCount decrement on delete failed', { videoId, e });
        }
      }

      const dayStatsKey = leapDayKeyFromStoredChallengeDate(
        challengeDate,
        toMillis(data.leapInchesAwardedAt ?? data.approvedAt ?? data.createdAt) || Date.now()
      );
      const statsSnap = await db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`).get();
      const statsFirstId = statsSnap.exists
        ? String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim()
        : '';
      const wasGlobalFirst =
        statsFirstId === videoId ||
        data.leapWasGlobalFirstPostOfDay === true ||
        data.leapWasFirstPostOfDay === true;

      if (wasGlobalFirst && challengeDate) {
        const { newFirstVideoId } = await handleGlobalFirstPostRemoved(db, {
          challengeDate,
          removedVideoId: videoId,
        });
        const retotaled = await retotalAllAwardedVideosForLeapDay(db, challengeDate);
        logger.info('global first post reassigned after video delete', {
          removedVideoId: videoId,
          challengeDate,
          newFirstVideoId,
          retotaledCount: retotaled.length,
        });
      }

      await recomputeUserLeapStatsAdmin(uid);
    } catch (e) {
      logger.error('leap stats recompute failed (video delete)', { uid, videoId, e });
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

    const afterStatus = String(after.moderationStatus ?? '');
    const beforeStatus = before ? String(before.moderationStatus ?? '') : '';

    if (beforeStatus === 'approved' && afterStatus === 'nulled' && before && isAwardedLeapVideo(before)) {
      try {
        await revokeLeapInchesForVideo(admin.firestore(), videoRef, videoId, before, false);
      } catch (e) {
        logger.warn('revoke leap inches (null) failed', { videoId, owner, e });
      }
      return;
    }

    if (
      before &&
      beforeStatus === 'approved' &&
      afterStatus !== 'approved' &&
      afterStatus !== 'nulled' &&
      isAwardedLeapVideo(before as Record<string, unknown>)
    ) {
      try {
        await revokeLeapInchesForVideo(admin.firestore(), videoRef, videoId, before, false);
      } catch (e) {
        logger.warn('revoke leap inches failed', { videoId, owner, e });
      }
      return;
    }

    if (afterStatus === 'approved' && beforeStatus !== 'approved') {
      try {
        await incrementApprovedPostCountForLeap(admin.firestore(), after, videoId);
      } catch (e) {
        logger.warn('approvedPostCount increment failed', { videoId, owner, e });
      }
      if (!isAwardedLeapVideo(after)) {
        try {
          await awardLeapInchesFirstApproval(admin.firestore(), videoRef, videoId, after);
        } catch (e) {
          logger.warn('award leap inches failed', { videoId, owner, e });
        }
      }
      return;
    }

    try {
      await recomputeUserLeapStatsAdmin(owner);
    } catch (e) {
      logger.error('leap stats recompute failed (video write)', { owner, e });
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
    if (!owner || (likerId && likerId === owner)) return;
    try {
      await maybeRefreshVideoLeapInchesAfterEngagement(videoId);
    } catch (e) {
      logger.warn('leap inches refresh failed (like)', { videoId, e });
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
      await maybeRefreshVideoLeapInchesAfterEngagement(videoId);
    } catch (e) {
      logger.warn('leap inches refresh failed (comment)', { videoId, e });
    }
  }
);

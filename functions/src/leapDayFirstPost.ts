import * as admin from 'firebase-admin';

import { leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import { challengeDateKeysForFirestoreIn } from './timeKeys';
import { isAwardedLeapVideo } from './verticalScoreEngine';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

const POST_COLLECTION = 'videos';

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/** @deprecated Use leapDayKeyFromStoredChallengeDate from `./leapDayKey`. */
export const canonicalChallengeDayKey = leapDayKeyFromStoredChallengeDate;

/**
 * Within a transaction: claim global first approved leap for this challenge day, or return true if
 * this video already holds the slot.
 */
export function claimGlobalFirstPostOfDayInTransaction(args: {
  tx: admin.firestore.Transaction;
  statsRef: admin.firestore.DocumentReference;
  statsSnap: admin.firestore.DocumentSnapshot;
  videoId: string;
  ownerUid: string;
  challengeDate: string;
}): boolean {
  const { tx, statsRef, statsSnap, videoId, ownerUid, challengeDate } = args;
  const existingId = statsSnap.exists
    ? String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim()
    : '';

  if (!existingId) {
    tx.set(statsRef, {
      challengeDate: leapDayKeyFromStoredChallengeDate(challengeDate),
      firstApprovedVideoId: videoId,
      firstApprovedUid: ownerUid,
      firstApprovedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return true;
  }
  return existingId === videoId;
}

function videoQualifiesAsGlobalFirst(data: Record<string, unknown>): boolean {
  if (data.deleted === true) return false;
  if (String(data.moderationStatus ?? '') !== 'approved') return false;
  return isAwardedLeapVideo(data);
}

/** Earliest awarded approved video for this leap day (live Firestore query). */
export async function findEarliestAwardedApprovedVideoIdForDay(
  db: admin.firestore.Firestore,
  challengeDate: string
): Promise<string | null> {
  const inKeys = challengeDateKeysForFirestoreIn([challengeDate]).slice(0, 30);
  if (!inKeys.length) return null;

  const snap = await db
    .collection(POST_COLLECTION)
    .where('challengeDate', 'in', inKeys)
    .where('moderationStatus', '==', 'approved')
    .limit(120)
    .get();

  let bestId: string | null = null;
  let bestMs = Infinity;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (!videoQualifiesAsGlobalFirst(data)) continue;
    const ms = toMillis(data.leapInchesAwardedAt ?? data.approvedAt ?? data.createdAt);
    if (ms > 0 && ms < bestMs) {
      bestMs = ms;
      bestId = d.id;
    }
  }
  return bestId;
}

/** Earliest awarded approved video for the day (stats doc if still valid, else query). */
export async function resolveGlobalFirstApprovedVideoIdForDay(
  db: admin.firestore.Firestore,
  challengeDate: string
): Promise<string | null> {
  const dayKey = leapDayKeyFromStoredChallengeDate(challengeDate);
  const statsSnap = await db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayKey}`).get();
  if (statsSnap.exists) {
    const id = String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim();
    if (id) {
      const vSnap = await db.doc(`${POST_COLLECTION}/${id}`).get();
      if (vSnap.exists && videoQualifiesAsGlobalFirst(vSnap.data() as Record<string, unknown>)) {
        return id;
      }
    }
  }

  return findEarliestAwardedApprovedVideoIdForDay(db, challengeDate);
}

/**
 * When the global first post is deleted (hard delete), clear the slot and promote the
 * next earliest awarded approved video, then callers should retotal leap inches for the day.
 */
export async function handleGlobalFirstPostRemoved(
  db: admin.firestore.Firestore,
  args: { challengeDate: string; removedVideoId: string }
): Promise<{ newFirstVideoId: string | null }> {
  const { challengeDate, removedVideoId } = args;
  const dayKey = leapDayKeyFromStoredChallengeDate(challengeDate);
  const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayKey}`);

  await db.runTransaction(async (tx) => {
    const statsSnap = await tx.get(statsRef);
    if (!statsSnap.exists) return;
    const firstId = String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim();
    if (firstId !== removedVideoId) return;
    tx.set(
      statsRef,
      {
        firstApprovedVideoId: admin.firestore.FieldValue.delete(),
        firstApprovedUid: admin.firestore.FieldValue.delete(),
        firstApprovedAt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
  });

  const newFirstId = await findEarliestAwardedApprovedVideoIdForDay(db, challengeDate);
  if (!newFirstId) {
    return { newFirstVideoId: null };
  }

  const vSnap = await db.doc(`${POST_COLLECTION}/${newFirstId}`).get();
  if (!vSnap.exists) {
    return { newFirstVideoId: null };
  }
  const vd = vSnap.data() as Record<string, unknown>;
  const ownerUid = String(vd.uid ?? '').trim();
  if (!ownerUid) {
    return { newFirstVideoId: null };
  }

  await db.runTransaction(async (tx) => {
    const statsSnap = await tx.get(statsRef);
    claimGlobalFirstPostOfDayInTransaction({
      tx,
      statsRef,
      statsSnap,
      videoId: newFirstId,
      ownerUid,
      challengeDate,
    });
  });

  return { newFirstVideoId: newFirstId };
}

/**
 * Repair stale `firstApproved*` stats (e.g. holder deleted before delete trigger existed) and
 * promote the earliest remaining awarded video when needed.
 */
export async function healGlobalFirstPostStatsForDay(
  db: admin.firestore.Firestore,
  challengeDate: string
): Promise<{ newFirstVideoId: string | null }> {
  const dayKey = leapDayKeyFromStoredChallengeDate(challengeDate);
  const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayKey}`);
  const statsSnap = await statsRef.get();
  const statsFirstId = statsSnap.exists
    ? String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim()
    : '';

  if (statsFirstId) {
    const vSnap = await db.doc(`${POST_COLLECTION}/${statsFirstId}`).get();
    if (vSnap.exists && videoQualifiesAsGlobalFirst(vSnap.data() as Record<string, unknown>)) {
      return { newFirstVideoId: statsFirstId };
    }
    await handleGlobalFirstPostRemoved(db, { challengeDate, removedVideoId: statsFirstId });
    return {
      newFirstVideoId: await findEarliestAwardedApprovedVideoIdForDay(db, challengeDate),
    };
  }

  const newFirstId = await findEarliestAwardedApprovedVideoIdForDay(db, challengeDate);
  if (!newFirstId) {
    return { newFirstVideoId: null };
  }

  const vSnap = await db.doc(`${POST_COLLECTION}/${newFirstId}`).get();
  const ownerUid = String((vSnap.data() as Record<string, unknown>)?.uid ?? '').trim();
  if (!ownerUid) {
    return { newFirstVideoId: null };
  }

  await db.runTransaction(async (tx) => {
    const freshStats = await tx.get(statsRef);
    claimGlobalFirstPostOfDayInTransaction({
      tx,
      statsRef,
      statsSnap: freshStats,
      videoId: newFirstId,
      ownerUid,
      challengeDate,
    });
  });

  return { newFirstVideoId: newFirstId };
}

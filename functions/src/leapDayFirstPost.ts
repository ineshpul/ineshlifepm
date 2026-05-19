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

/** Earliest awarded approved video for the day (stats doc, then query fallback). */
export async function resolveGlobalFirstApprovedVideoIdForDay(
  db: admin.firestore.Firestore,
  challengeDate: string
): Promise<string | null> {
  const dayKey = leapDayKeyFromStoredChallengeDate(challengeDate);
  const statsSnap = await db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayKey}`).get();
  if (statsSnap.exists) {
    const id = String((statsSnap.data() as Record<string, unknown>)?.firstApprovedVideoId ?? '').trim();
    if (id) return id;
  }

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
    if (data.deleted === true) continue;
    if (!isAwardedLeapVideo(data)) continue;
    const ms = toMillis(data.leapInchesAwardedAt ?? data.approvedAt ?? data.createdAt);
    if (ms > 0 && ms < bestMs) {
      bestMs = ms;
      bestId = d.id;
    }
  }
  return bestId;
}

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { getDayKey, leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import { challengeDateKeysForFirestoreIn } from './timeKeys';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

const REGION = 'us-central1';
const POST_COLLECTION = 'videos';

async function countApprovedVideosForDay(
  db: admin.firestore.Firestore,
  dayKey: string
): Promise<number> {
  const inKeys = challengeDateKeysForFirestoreIn([dayKey]).slice(0, 30);
  if (!inKeys.length) return 0;

  const snap = await db
    .collection(POST_COLLECTION)
    .where('challengeDate', 'in', inKeys)
    .where('moderationStatus', '==', 'approved')
    .get();

  let n = 0;
  const targetNorm = leapDayKeyFromStoredChallengeDate(dayKey);
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.deleted === true) continue;
    const cd = leapDayKeyFromStoredChallengeDate(String(data.challengeDate ?? ''), Date.now());
    if (cd !== targetNorm) continue;
    n += 1;
  }
  return n;
}

/**
 * Admin-only: set `dailyChallengeStats/{dayKey}.approvedPostCount` from approved `videos`
 * (and rebuild `countedApprovedVideoIds` for that day).
 */
export const backfillApprovedPostCountCallable = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const rawDay = String(request.data?.dayKey ?? '').trim();
  const dayKey = rawDay || getDayKey('America/New_York');
  const dryRun = Boolean(request.data?.dryRun);

  const count = await countApprovedVideosForDay(db, dayKey);
  const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${leapDayKeyFromStoredChallengeDate(dayKey)}`);

  logger.info('backfillApprovedPostCount', { dayKey, count, dryRun, statsPath: statsRef.path });

  if (!dryRun) {
    const inKeys = challengeDateKeysForFirestoreIn([dayKey]).slice(0, 30);
    const snap = await db
      .collection(POST_COLLECTION)
      .where('challengeDate', 'in', inKeys)
      .where('moderationStatus', '==', 'approved')
      .get();

    const targetNorm = leapDayKeyFromStoredChallengeDate(dayKey);
    const countedApprovedVideoIds: Record<string, boolean> = {};
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      const cd = leapDayKeyFromStoredChallengeDate(String(data.challengeDate ?? ''), Date.now());
      if (cd !== targetNorm) continue;
      countedApprovedVideoIds[d.id] = true;
    }

    await statsRef.set(
      {
        challengeDate: targetNorm,
        approvedPostCount: count,
        countedApprovedVideoIds,
        lastApprovedPostCountBackfillAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return { dayKey, count, dryRun, statsPath: statsRef.path };
});

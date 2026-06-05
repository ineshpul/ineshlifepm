import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { getDayKey } from './leapDayKey';
import {
  countApprovedVideosForDay,
  reconcileApprovedPostCountForLeapDay,
} from './dailyChallengeStatsPosts';

/**
 * Admin-only: set `dailyChallengeStats/{dayKey}.approvedPostCount` from approved `videos`
 * (and rebuild `countedApprovedVideoIds` for that day).
 */
export const backfillApprovedPostCountCallable = onCall(CALLABLE_OPTIONS, async (request) => {
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

  logger.info('backfillApprovedPostCount', { dayKey, count, dryRun });

  if (!dryRun) {
    await reconcileApprovedPostCountForLeapDay(db, dayKey);
  }

  return { dayKey, count, dryRun };
});

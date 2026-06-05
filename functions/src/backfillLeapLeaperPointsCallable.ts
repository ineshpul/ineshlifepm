import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { runBackfillLeapLeaperPointsPage } from './backfillLeapLeaperPointsCore';


/**
 * Admin-only: one-time per video via `videos.leapLeaperPointsBackfilled !== true`.
 * Run repeatedly with `cursorVideoId` until `done` is true.
 */
export const backfillLeapLeaperPointsCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const dryRun = Boolean(request.data?.dryRun);
  const creditAllToCurrentNyWeek = request.data?.creditAllToCurrentNyWeek !== false;
  const pageSize = Math.min(Math.max(Number(request.data?.limit) || 80, 1), 300);
  const cursorVideoId = String(request.data?.cursorVideoId ?? '').trim();

  return runBackfillLeapLeaperPointsPage(db, {
    dryRun,
    creditAllToCurrentNyWeek,
    pageSize,
    cursorVideoId,
  });
});

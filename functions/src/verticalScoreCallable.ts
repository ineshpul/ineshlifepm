import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { recomputeVerticalScoreAdmin } from './verticalScoreRecompute';

const REGION = 'us-central1';

/**
 * Authenticated users may recompute their own Vertical Score only (admin SDK write).
 */
export const recomputeVerticalScoreCallable = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  await recomputeVerticalScoreAdmin(uid);
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const data = snap.data() ?? {};
  return {
    verticalScore: Number(data.verticalScore ?? 0),
    verticalScoreBreakdown: data.verticalScoreBreakdown ?? {
      consistency: 0,
      engagement: 0,
      reliability: 0,
      bonus: 0,
    },
  };
});

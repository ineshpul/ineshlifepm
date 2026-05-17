import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { cumulativeInchesFromUser } from './verticalScoreEngine';
import { recomputeUserLeapStatsAdmin } from './verticalScoreRecompute';

const REGION = 'us-central1';

/** Authenticated users may recompute their own leap stats (admin SDK write). */
export const recomputeVerticalScoreCallable = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  await recomputeUserLeapStatsAdmin(uid);
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const data = snap.data() ?? {};
  return {
    leaperLifetimePoints: cumulativeInchesFromUser(data),
    leaperDayPoints: Number(data.leaperDayPoints ?? 0),
    leaperWeekPoints: Number(data.leaperWeekPoints ?? 0),
    highestDayLeapInches: Number(data.highestDayLeapInches ?? 0),
    activeLeapStreakDays: Number(data.activeLeapStreakDays ?? 0),
  };
});

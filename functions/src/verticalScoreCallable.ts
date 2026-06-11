import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { cumulativeInchesFromUser } from './verticalScoreEngine';
import { recomputeUserLeapStatsAdmin } from './verticalScoreRecompute';

import { CALLABLE_OPTIONS } from './callableOptions';

/**
 * Authenticated users may recompute their own leap stats (admin SDK write).
 * Also used as the session heal callable on login / app foreground (`scheduleLeapStatsHealOnSession`).
 */
export const recomputeVerticalScoreCallable = onCall(CALLABLE_OPTIONS, async (request) => {
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

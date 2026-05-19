import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { getDayKey } from './leapDayKey';
import { healGlobalFirstPostStatsForDay } from './leapDayFirstPost';
import { retotalAllAwardedVideosForLeapDay } from './verticalScoreRecompute';

const REGION = 'us-central1';

/** Admin-only: fix stale global-first-post stats and retotal leap inches for a leap day. */
export const healGlobalFirstPostForDayCallable = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const dayKey = String(request.data?.dayKey ?? '').trim() || getDayKey('America/New_York');
  const { newFirstVideoId } = await healGlobalFirstPostStatsForDay(db, dayKey);
  const retotaledVideoIds = await retotalAllAwardedVideosForLeapDay(db, dayKey);

  return { dayKey, newFirstVideoId, retotaledCount: retotaledVideoIds.length };
});

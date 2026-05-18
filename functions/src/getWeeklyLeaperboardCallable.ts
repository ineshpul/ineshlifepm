import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { buildWeeklyLeaperboard } from './weeklyLeaperboardCore';

const REGION = 'us-central1';

/** Authenticated weekly leaperboard (Admin SDK — not gated by “posted today”). */
export const getWeeklyLeaperboardCallable = onCall({ region: REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const weekStartKey = String(request.data?.weekStartKey ?? '').trim();
  const result = await buildWeeklyLeaperboard(admin.firestore(), {
    weekStartKey: weekStartKey || undefined,
  });

  return result;
});

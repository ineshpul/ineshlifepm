import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { runBackfillUserIdentityFromVideosPage } from './backfillUserIdentityFromVideosCore';

const REGION = 'us-central1';

/**
 * Admin-only: copy `username` / `photoUrl` from each user's latest leap onto `users/{uid}`
 * when the profile row would show as Anonymous on the leaperboard.
 */
export const backfillUserIdentityFromVideosCallable = onCall(
  { region: REGION, timeoutSeconds: 120 },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

    const db = admin.firestore();
    const me = await db.doc(`users/${callerUid}`).get();
    if (!me.exists || me.data()?.isAdmin !== true) {
      throw new HttpsError('permission-denied', 'Admin only.');
    }

    const dryRun = Boolean(request.data?.dryRun);
    const pageSize = Math.min(Math.max(Number(request.data?.limit) || 30, 1), 80);
    const cursorUserId = String(request.data?.cursorUserId ?? '').trim();

    return runBackfillUserIdentityFromVideosPage(db, { dryRun, pageSize, cursorUserId });
  }
);

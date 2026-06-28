import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { challengePostStatsBucket, uploadChallengePostStatsExport } from './exportChallengePostStatsCore';
import { getDayKey } from './leapDayKey';

/**
 * Admin-only: rebuild challenge post stats export and upload CSV + Excel to Cloud Storage.
 * Also runs automatically at 12:05 PM ET after each leap day closes.
 */
export const exportChallengePostStatsCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const reconcileDayKey = String(request.data?.dayKey ?? '').trim() || getDayKey('America/New_York');
  const result = await uploadChallengePostStatsExport(db, admin.auth(), {
    reconcileDayKey,
    closedLeapDayKey: reconcileDayKey,
  });

  const bucket = challengePostStatsBucket();
  const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const [csvUrl, xlsxUrl] = await Promise.all([
    bucket.file(result.csvPath).getSignedUrl({ action: 'read', expires }),
    bucket.file(result.xlsxPath).getSignedUrl({ action: 'read', expires }),
  ]);

  return {
    ...result,
    csvDownloadUrl: csvUrl[0],
    xlsxDownloadUrl: xlsxUrl[0],
    downloadUrlExpiresAtMs: expires,
  };
});

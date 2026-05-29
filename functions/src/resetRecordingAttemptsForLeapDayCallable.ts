import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import {
  defaultLeapChallengeDateForReset,
  runResetRecordingAttemptsForLeapDayPage,
} from './resetRecordingAttemptsForLeapDayCore';

const REGION = 'us-central1';

function normalizeDateKey(raw: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Admin-only: reset today's recording attempt ledger for users who have not posted for the leap day.
 */
export const resetRecordingAttemptsForLeapDayCallable = onCall({ region: REGION }, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const rawDate = String(request.data?.challengeDate ?? '').trim();
  const challengeDate = rawDate ? normalizeDateKey(rawDate) : defaultLeapChallengeDateForReset(Date.now());
  if (!challengeDate) throw new HttpsError('invalid-argument', 'Invalid challengeDate.');

  const dryRun = Boolean(request.data?.dryRun);
  const pageSize = Math.min(Math.max(Number(request.data?.pageSize) || 200, 1), 400);
  const cursorAttemptId = String(request.data?.cursorAttemptId ?? '').trim() || undefined;

  const result = await runResetRecordingAttemptsForLeapDayPage(db, {
    challengeDate,
    dryRun,
    pageSize,
    cursorAttemptId,
  });

  logger.info('resetRecordingAttemptsForLeapDay', { dryRun, ...result });

  return result;
});

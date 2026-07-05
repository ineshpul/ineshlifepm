import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { isActiveLeapVideoDoc, videoBlocksLeapRepost } from './postAttemptLeapVideo';
import { BONUS_ATTEMPT_BASE_REDUCTION_INCHES } from './verticalScoreEngine';
import { leapChallengeDateKeyFromMs } from './timeKeys';


function normalizeDateKey(raw: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function maxAttemptsFromChallenge(data: admin.firestore.DocumentData | undefined): number {
  const n = Math.round(Number(data?.maxRecordingAttempts ?? 3));
  if (!Number.isFinite(n)) return 3;
  return Math.min(50, Math.max(1, n));
}

/**
 * Restore one recording attempt when the daily ledger is exhausted.
 * Marks the leap so {@link BONUS_ATTEMPT_BASE_REDUCTION_INCHES} is deducted from post base at award time.
 */
export const purchaseRecordingAttemptCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const challengeDate = normalizeDateKey(String(request.data?.challengeDate ?? ''));
  if (!challengeDate) throw new HttpsError('invalid-argument', 'challengeDate required');

  const expected = leapChallengeDateKeyFromMs(Date.now());
  if (challengeDate !== expected) {
    throw new HttpsError('invalid-argument', 'Challenge day mismatch — refresh and try again.');
  }

  const db = admin.firestore();
  const attemptId = `${uid}_${challengeDate}`;
  const attemptRef = db.doc(`postAttempts/${attemptId}`);
  const videoRef = db.doc(`videos/${attemptId}`);
  const challengeRef = db.doc(`challenges/${challengeDate}`);
  await db.runTransaction(async (tx) => {
    const videoSnap = await tx.get(videoRef);
    if (videoBlocksLeapRepost(videoSnap, uid)) {
      throw new HttpsError('failed-precondition', 'You already posted for this leap.');
    }
    if (videoSnap.exists && !isActiveLeapVideoDoc(videoSnap.data(), uid)) {
      tx.delete(videoRef);
    }

    const chSnap = await tx.get(challengeRef);
    const max = maxAttemptsFromChallenge(chSnap.data());

    const attSnap = await tx.get(attemptRef);
    const used = Number(attSnap.data()?.used ?? 0);

    if (used < max) {
      throw new HttpsError('failed-precondition', 'You still have recording attempts.');
    }

    const nextUsed = Math.max(0, used - 1);

    tx.set(
      attemptRef,
      {
        uid,
        challengeDate,
        used: nextUsed,
        max,
        leapBaseReductionInches: BONUS_ATTEMPT_BASE_REDUCTION_INCHES,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  const [attAfter, chAfter] = await Promise.all([attemptRef.get(), challengeRef.get()]);

  const max = maxAttemptsFromChallenge(chAfter.data());
  const used = Number(attAfter.data()?.used ?? 0);

  return {
    ok: true,
    remaining: Math.max(0, max - used),
    baseReductionInches: BONUS_ATTEMPT_BASE_REDUCTION_INCHES,
  };
});

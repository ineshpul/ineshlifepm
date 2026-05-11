import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from './timeKeys';
import { recomputeVerticalScoreAdmin } from './verticalScoreRecompute';

const REGION = 'us-central1';

const COST = 5;

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
 * Spend Vertical Score to restore one recording attempt when the daily ledger is exhausted.
 * Writes `verticalScoreAdjustment` (merged into displayed score on recompute).
 */
export const purchaseRecordingAttemptCallable = onCall({ region: REGION }, async (request) => {
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
  const userRef = db.doc(`users/${uid}`);
  const challengeRef = db.doc(`challenges/${challengeDate}`);

  await db.runTransaction(async (tx) => {
    const videoSnap = await tx.get(videoRef);
    if (videoSnap.exists) {
      throw new HttpsError('failed-precondition', 'You already posted for this leap.');
    }

    const userSnap = await tx.get(userRef);
    const score = Math.round(Number(userSnap.data()?.verticalScore ?? 0));
    if (score < COST) {
      throw new HttpsError(
        'failed-precondition',
        `You need at least ${COST} Vertical Score (you have ${score}).`
      );
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      userRef,
      {
        verticalScoreAdjustment: admin.firestore.FieldValue.increment(-COST),
      },
      { merge: true }
    );
  });

  await recomputeVerticalScoreAdmin(uid);

  const [userAfter, attAfter, chAfter] = await Promise.all([
    userRef.get(),
    attemptRef.get(),
    challengeRef.get(),
  ]);

  const max = maxAttemptsFromChallenge(chAfter.data());
  const used = Number(attAfter.data()?.used ?? 0);

  return {
    ok: true,
    remaining: Math.max(0, max - used),
    verticalScore: Math.round(Number(userAfter.data()?.verticalScore ?? 0)),
    cost: COST,
  };
});

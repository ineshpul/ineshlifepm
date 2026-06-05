/**
 * Reset one user's recording ledger for a leap day (no video posted).
 *
 *   cd functions
 *   npm run build
 *   $env:USER_UID = "their-firebase-uid"
 *   $env:CHALLENGE_DATE = "2026-06-03"   # optional; defaults to today's leap key
 *   node lib/runResetRecordingAttemptsForUserScript.js
 */

import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from './timeKeys';
import { runResetRecordingAttemptsForLeapDayPage } from './resetRecordingAttemptsForLeapDayCore';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

async function main(): Promise<void> {
  const uid = String(process.env.USER_UID ?? '').trim();
  if (!uid) {
    console.error('Set USER_UID to the stuck user’s Firebase Auth uid.');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const challengeDate =
    String(process.env.CHALLENGE_DATE ?? '').trim() || leapChallengeDateKeyFromMs(Date.now());
  const attemptId = `${uid}_${challengeDate}`;

  const videoSnap = await db.doc(`videos/${attemptId}`).get();
  if (videoSnap.exists) {
    const vd = videoSnap.data() as { deleted?: boolean; uid?: string } | undefined;
    if (vd?.deleted !== true && String(vd?.uid ?? uid) === uid) {
      console.error(
        JSON.stringify({
          error: 'User still has a video for this day. Delete videos/' + attemptId + ' first.',
        })
      );
      process.exit(1);
    }
  }

  const attemptRef = db.doc(`postAttempts/${attemptId}`);
  const attemptSnap = await attemptRef.get();
  if (!attemptSnap.exists) {
    console.log(JSON.stringify({ ok: true, message: 'No postAttempts doc — user already has a fresh ledger.' }));
    process.exit(0);
  }

  const challengeSnap = await db.doc(`challenges/${challengeDate}`).get();
  const max = Math.min(
    50,
    Math.max(1, Math.round(Number(challengeSnap.data()?.maxRecordingAttempts ?? 3)) || 3)
  );

  await attemptRef.set(
    {
      uid,
      challengeDate,
      used: 0,
      max,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log(JSON.stringify({ ok: true, attemptId, used: 0, max, challengeDate }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

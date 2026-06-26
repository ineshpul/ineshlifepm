/**
 * Clear today's leap post so a user (e.g. mod testing) can record again.
 * Hard-deletes `videos/{uid}_{challengeDate}`, subcollections, and `postAttempts`.
 *
 * Usage (from `functions/`):
 *   npm run allow:repost
 *
 *   $env:USER_UID = "your-firebase-uid"
 *   $env:CHALLENGE_DATE = "2026-06-21"   # optional; defaults to active leap day
 *   npm run allow:repost
 *
 * Requires Application Default Credentials (`gcloud auth application-default login`).
 */

import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from '../timeKeys';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

async function deleteVideoDoc(
  db: admin.firestore.Firestore,
  videoRef: admin.firestore.DocumentReference
): Promise<boolean> {
  const snap = await videoRef.get();
  if (!snap.exists) return false;

  const likes = await videoRef.collection('likes').limit(500).get();
  const comments = await videoRef.collection('comments').limit(500).get();
  const batch = db.batch();
  for (const d of likes.docs) batch.delete(d.ref);
  for (const d of comments.docs) batch.delete(d.ref);
  batch.delete(videoRef);
  await batch.commit();
  return true;
}

async function main(): Promise<void> {
  const uid = String(process.env.USER_UID ?? process.argv[2] ?? '').trim();
  if (!uid) {
    console.error('Set USER_UID (or pass uid as first arg).');
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const challengeDate =
    String(process.env.CHALLENGE_DATE ?? '').trim() || leapChallengeDateKeyFromMs(Date.now());
  const attemptId = `${uid}_${challengeDate}`;

  const videoRef = db.doc(`videos/${attemptId}`);
  const videoRemoved = await deleteVideoDoc(db, videoRef);

  const attemptRef = db.doc(`postAttempts/${attemptId}`);
  const attemptSnap = await attemptRef.get();
  let attemptRemoved = false;
  if (attemptSnap.exists) {
    await attemptRef.delete();
    attemptRemoved = true;
  }

  const challengeSnap = await db.doc(`challenges/${challengeDate}`).get();
  const max = Math.min(
    50,
    Math.max(1, Math.round(Number(challengeSnap.data()?.maxRecordingAttempts ?? 3)) || 3)
  );

  await attemptRef.set({
    uid,
    challengeDate,
    used: 0,
    max,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        uid,
        challengeDate,
        videoRemoved,
        attemptRemoved,
        freshLedger: { used: 0, max },
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

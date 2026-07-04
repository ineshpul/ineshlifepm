/**
 * Grant a short catch-up window to post for the previous leap day (streak uses `challengeDate`).
 *
 *   $env:EMAILS = "a@x.com,b@y.com"
 *   $env:MINUTES = "10"
 *   npm run grant:late-post
 */

import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from '../timeKeys';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

function prevNyDateKey(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey).trim());
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d, 17, 0, 0) - 25 * 3600000;
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(t));
  return s;
}

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

async function prepareCatchUpDay(
  db: admin.firestore.Firestore,
  uid: string,
  challengeDate: string
): Promise<{ videoRemoved: boolean; attemptsReady: boolean }> {
  const attemptId = `${uid}_${challengeDate}`;
  const videoRef = db.doc(`videos/${attemptId}`);
  const videoRemoved = await deleteVideoDoc(db, videoRef);

  const challengeSnap = await db.doc(`challenges/${challengeDate}`).get();
  const max = Math.min(
    50,
    Math.max(1, Math.round(Number(challengeSnap.data()?.maxRecordingAttempts ?? 3)) || 3)
  );

  await db.doc(`postAttempts/${attemptId}`).set(
    {
      uid,
      challengeDate,
      used: 0,
      max,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      bonusRecordingAttempts: admin.firestore.FieldValue.delete(),
      leapBaseReductionInches: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );

  return { videoRemoved, attemptsReady: true };
}

async function main(): Promise<void> {
  const rawEmails =
    String(process.env.EMAILS ?? process.argv.slice(2).join(',') ?? '').trim() ||
    'pulugurtha.inesh@gmail.com,mdvanukuru@gmail.com';
  const emails = rawEmails
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) {
    console.error('Set EMAILS (comma-separated) or pass emails as args.');
    process.exit(1);
  }

  const minutes = Math.min(60, Math.max(1, Math.round(Number(process.env.MINUTES ?? 10)) || 10));
  const expiresAtMs = Date.now() + minutes * 60_000;

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();
  const auth = admin.auth();

  const viewingKey = leapChallengeDateKeyFromMs(Date.now());
  const challengeDate = prevNyDateKey(viewingKey);

  const grantRef = db.doc('config/latePostGrants');
  const grantSnap = await grantRef.get();
  const byUid = { ...(grantSnap.data()?.byUid as Record<string, unknown> | undefined) };

  const results: Record<string, unknown>[] = [];

  for (const email of emails) {
    let uid = '';
    try {
      const user = await auth.getUserByEmail(email);
      uid = user.uid;
    } catch {
      results.push({ email, ok: false, error: 'auth user not found' });
      continue;
    }

    const prep = await prepareCatchUpDay(db, uid, challengeDate);
    byUid[uid] = {
      email,
      challengeDate,
      expiresAtMs,
      grantedAtMs: Date.now(),
    };
    results.push({ email, uid, ok: true, challengeDate, expiresAtMs, ...prep });
  }

  await grantRef.set({ byUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        viewingChallengeDateKey: viewingKey,
        catchUpChallengeDate: challengeDate,
        minutes,
        results,
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

/**
 * Grant App Store review access: admin flag + verified email for a demo account.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/grantAppReviewAccess.js janustravels123@gmail.com
 *
 * Requires Application Default Credentials (e.g. `gcloud auth application-default login`
 * or `GOOGLE_APPLICATION_CREDENTIALS` to a service account with Firebase Admin).
 */

import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from '../timeKeys';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'leap-e4cce';

admin.initializeApp({ projectId: PROJECT_ID });

const db = admin.firestore();
const auth = admin.auth();

async function findSampleApprovedVideo(): Promise<Record<string, unknown> | null> {
  const snap = await db
    .collection('videos')
    .where('moderationStatus', '==', 'approved')
    .limit(10)
    .get();
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.deleted === true) continue;
    const url = String(data.url ?? '').trim();
    if (url.startsWith('http')) return data;
  }
  return null;
}

async function ensureTodayApprovedLeap(uid: string, username: string): Promise<string | null> {
  const challengeDate = leapChallengeDateKeyFromMs(Date.now());
  const videoId = `${uid}_${challengeDate}`;
  const ref = db.collection('videos').doc(videoId);
  const existing = await ref.get();
  if (existing.exists) {
    const status = String(existing.data()?.moderationStatus ?? '');
    const deleted = existing.data()?.deleted === true;
    if (!deleted && (status === 'approved' || status === 'pending')) {
      return videoId;
    }
  }

  const sample = await findSampleApprovedVideo();
  if (!sample) {
    console.warn('No sample approved video found — feed unlock may require posting a leap.');
    return null;
  }

  const challengeSnap = await db.doc(`challenges/${challengeDate}`).get();
  const challenge = challengeSnap.data() ?? {};

  await ref.set(
    {
      uid,
      username,
      challengeDate,
      challengeTitle: String(challenge.title ?? sample.challengeTitle ?? "Today's leap"),
      challengeSubtitle: String(challenge.subtitle ?? sample.challengeSubtitle ?? ''),
      prompt: String(challenge.prompt ?? sample.prompt ?? challenge.title ?? "Today's leap"),
      maxDurationSeconds: Number(challenge.maxDurationSeconds ?? sample.maxDurationSeconds ?? 60),
      source: 'app-review-seed',
      url: String(sample.url ?? ''),
      ...(sample.secondaryUrl ? { secondaryUrl: sample.secondaryUrl } : {}),
      ...(sample.storagePath ? { storagePath: `videos/${uid}/${challengeDate}/app-review-seed.mp4` } : {}),
      moderationStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      viewCount: 0,
      likesCount: 0,
      commentsCount: 0,
      shareCount: 0,
      saveCount: 0,
      reportCount: 0,
      deleted: false,
      challengeCompleted: true,
    },
    { merge: true }
  );

  return videoId;
}

async function main() {
  const email = (process.argv[2] ?? 'janustravels123@gmail.com').trim().toLowerCase();
  if (!email.includes('@')) {
    console.error('Usage: node lib/scripts/grantAppReviewAccess.js <email>');
    process.exit(1);
  }

  let user: admin.auth.UserRecord;
  try {
    user = await auth.getUserByEmail(email);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code;
    if (code === 'auth/user-not-found') {
      console.error(`No Firebase Auth user for ${email}. Create the account in the app first, then re-run.`);
      process.exit(1);
    }
    throw e;
  }

  const uid = user.uid;
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();

  await userRef.set(
    {
      isAdmin: true,
      bypassFeedGate: true,
      appReviewAccessGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (!user.emailVerified) {
    await auth.updateUser(uid, { emailVerified: true });
  }

  const username =
    (snap.exists ? String(snap.data()?.username ?? '') : '') ||
    String(user.displayName ?? '').trim() ||
    email.split('@')[0] ||
    'reviewer';

  const seededVideoId = await ensureTodayApprovedLeap(uid, username);

  console.log('App review access granted.');
  console.log(`  email:    ${email}`);
  console.log(`  uid:      ${uid}`);
  console.log(`  username: ${username}`);
  console.log(`  isAdmin:  true`);
  console.log(`  emailVerified: true`);
  if (seededVideoId) console.log(`  todayLeap: ${seededVideoId} (approved)`);
  console.log(`  bypassFeedGate: true`);
  console.log('');
  console.log('Add this login to App Store Connect → App Review Information (username + password).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

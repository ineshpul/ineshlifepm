import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

import { CALLABLE_OPTIONS } from './callableOptions';
import { incrementUserLeapInches } from './leaperPoints';
import { leapChallengeDateKeyFromMs } from './timeKeys';

export const INTRO_LEAP_CHALLENGE_DATE = 'intro';
export const INTRO_LEAP_INCHES = 10;
export const INTRO_LEAP_PROMPT = "Say what's up!";

export function introLeapVideoDocId(uid: string): string {
  return `${uid}_intro`;
}

export function isIntroLeapDoc(data: admin.firestore.DocumentData | undefined): boolean {
  if (!data) return false;
  return data.isIntroLeap === true || String(data.source ?? '') === 'intro';
}

function assertIntroStoragePath(uid: string, storagePath: string) {
  const prefix = `videos/${uid}/intro/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes('..') || storagePath.length > 240) {
    throw new HttpsError('invalid-argument', 'Invalid storage path.');
  }
  if (!storagePath.endsWith('.mp4')) {
    throw new HttpsError('invalid-argument', 'Intro leap must be mp4.');
  }
}

async function downloadUrlForStoragePath(storagePath: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [meta] = await file.getMetadata();
  let token = String(meta.metadata?.firebaseStorageDownloadTokens ?? '').trim();
  if (!token) {
    token = randomUUID();
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
}

async function userIntroAlreadyDone(
  db: admin.firestore.Firestore,
  uid: string
): Promise<boolean> {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.data()?.introLeapCompleted === true) return true;
  const introSnap = await db.doc(`videos/${introLeapVideoDocId(uid)}`).get();
  return introSnap.exists && isIntroLeapDoc(introSnap.data());
}

type CommitIntroLeapRequest = {
  storagePath?: string;
  maxDurationSeconds?: number;
};

export const commitIntroLeapCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const data = (request.data ?? {}) as CommitIntroLeapRequest;
  const storagePath = String(data.storagePath ?? '').trim();
  if (!storagePath) throw new HttpsError('invalid-argument', 'storagePath required.');
  assertIntroStoragePath(uid, storagePath);

  const maxDurationSeconds = Math.max(1, Math.min(60, Math.floor(Number(data.maxDurationSeconds ?? 15))));

  const db = admin.firestore();
  if (await userIntroAlreadyDone(db, uid)) {
    throw new HttpsError('already-exists', 'Intro leap already completed.');
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError('failed-precondition', 'Upload your clip before posting.');
  }

  const downloadUrl = await downloadUrlForStoragePath(storagePath);

  const userSnap = await db.doc(`users/${uid}`).get();
  const username = String(userSnap.data()?.username ?? 'user').trim() || 'user';
  const photoUrl = String(userSnap.data()?.photoUrl ?? '').trim();

  const videoId = introLeapVideoDocId(uid);
  const videoRef = db.doc(`videos/${videoId}`);
  const introSnap = await videoRef.get();
  if (introSnap.exists && isIntroLeapDoc(introSnap.data())) {
    throw new HttpsError('already-exists', 'Intro leap already completed.');
  }

  const nowMs = Date.now();
  const dayKey = leapChallengeDateKeyFromMs(nowMs);

  await db.runTransaction(async (tx) => {
    const payload: Record<string, unknown> = {
      uid,
      username,
      ...(photoUrl ? { photoUrl } : {}),
      challengeDate: INTRO_LEAP_CHALLENGE_DATE,
      challengeTitle: INTRO_LEAP_PROMPT,
      challengeSubtitle: 'Your first hello on Leap',
      prompt: INTRO_LEAP_PROMPT,
      maxDurationSeconds,
      source: 'intro',
      isIntroLeap: true,
      hideFromFeed: true,
      url: downloadUrl,
      storagePath,
      moderationStatus: 'approved',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      viewCount: 0,
      likesCount: 0,
      commentsCount: 0,
      shareCount: 0,
      saveCount: 0,
      reportCount: 0,
      deleted: false,
      challengeCompleted: false,
      leapInches: INTRO_LEAP_INCHES,
      leapInchesAwarded: true,
    };

    tx.set(videoRef, payload);
    tx.set(
      db.doc(`users/${uid}`),
      {
        introLeapCompleted: true,
        introLeapSkipped: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  await incrementUserLeapInches(
    db,
    uid,
    INTRO_LEAP_INCHES,
    dayKey,
    nowMs,
    nowMs,
    'introLeap'
  );

  return { videoId, inches: INTRO_LEAP_INCHES };
});

export const skipIntroLeapCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  if (await userIntroAlreadyDone(db, uid)) {
    return { skipped: true, alreadyDone: true };
  }

  await db.doc(`users/${uid}`).set(
    {
      introLeapCompleted: true,
      introLeapSkipped: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { skipped: true, alreadyDone: false };
});

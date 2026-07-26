import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export type LeapUploadUrlPair = {
  storagePath: string;
  uploadUrl: string;
};

export type LeapUploadUrlsResult = {
  contentType: string;
  expiresAtMs: number;
  primary: LeapUploadUrlPair;
  secondary: LeapUploadUrlPair | null;
};

export async function createLeapUploadUrls(args: {
  challengeDate: string;
  primaryStoragePath: string;
  secondaryStoragePath?: string | null;
}): Promise<LeapUploadUrlsResult> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  const cur = auth.currentUser;
  if (!cur) {
    throw new Error('Sign in required.');
  }
  await cur.getIdToken(true);

  const fn = httpsCallable<
    {
      challengeDate: string;
      primaryStoragePath: string;
      secondaryStoragePath?: string | null;
    },
    LeapUploadUrlsResult
  >(firebaseFunctions(), 'createLeapUploadUrlsCallable');

  const res = await fn({
    challengeDate: args.challengeDate,
    primaryStoragePath: args.primaryStoragePath,
    secondaryStoragePath: args.secondaryStoragePath ?? null,
  });
  return res.data;
}

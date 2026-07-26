import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';
import type { BestPartMediaType } from '../types/bestPart';

export type BestPartUploadUrlPair = {
  storagePath: string;
  uploadUrl: string;
};

export type BestPartUploadUrlsResult = {
  contentType: string;
  expiresAtMs: number;
  primary: BestPartUploadUrlPair;
  secondary: BestPartUploadUrlPair | null;
};

export async function createBestPartUploadUrls(args: {
  dateKey: string;
  mediaType: BestPartMediaType;
  primaryStoragePath: string;
  secondaryStoragePath?: string | null;
}): Promise<BestPartUploadUrlsResult> {
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
      dateKey: string;
      mediaType: BestPartMediaType;
      primaryStoragePath: string;
      secondaryStoragePath?: string | null;
    },
    BestPartUploadUrlsResult
  >(firebaseFunctions(), 'createBestPartUploadUrlsCallable');

  const res = await fn({
    dateKey: args.dateKey,
    mediaType: args.mediaType,
    primaryStoragePath: args.primaryStoragePath,
    secondaryStoragePath: args.secondaryStoragePath ?? null,
  });
  return res.data;
}

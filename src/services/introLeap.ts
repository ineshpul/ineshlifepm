import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import * as FileSystem from 'expo-file-system/legacy';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured, storage } from '../firebase/firebase';
import { withRetries } from '../utils/retry';

export const INTRO_LEAP_PROMPT = "Say what's up!";
export const INTRO_LEAP_MAX_SECONDS = 15;
export const INTRO_LEAP_INCHES = 10;

export function allocateIntroLeapStoragePath(uid: string): string {
  return `videos/${uid}/intro/${Date.now()}.mp4`;
}

async function uriToBlob(uri: string): Promise<Blob> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('Recording file is no longer on this device. Record again.');
  }
  const res = await fetch(uri);
  const blob = await res.blob();
  if (!(blob instanceof Blob) || blob.size < 64) {
    throw new Error('This clip looks empty. Try recording again.');
  }
  return blob;
}

export async function uploadAndCommitIntroLeap(args: {
  uid: string;
  clipUri: string;
  maxDurationSeconds: number;
  onProgress?: (pct: number) => void;
}): Promise<{ videoId: string; inches: number }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  const cur = auth.currentUser;
  if (!cur) throw new Error('Sign in required.');
  await cur.getIdToken(true);

  const storagePath = allocateIntroLeapStoragePath(args.uid);
  const blob = await uriToBlob(args.clipUri);
  const storageRef = ref(storage(), storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, { contentType: 'video/mp4' });
    task.on(
      'state_changed',
      (snap) => {
        const total = snap.totalBytes;
        if (total > 0) {
          args.onProgress?.(Math.min(99, Math.round((snap.bytesTransferred / total) * 100)));
        }
      },
      reject,
      () => resolve()
    );
  });

  args.onProgress?.(100);
  await getDownloadURL(storageRef).catch(() => {});

  const commitFn = httpsCallable<
    { storagePath: string; maxDurationSeconds: number },
    { videoId: string; inches: number }
  >(firebaseFunctions(), 'commitIntroLeapCallable');

  const res = await withRetries(
    () =>
      commitFn({
        storagePath,
        maxDurationSeconds: args.maxDurationSeconds,
      }),
    { maxAttempts: 3 }
  );

  return res.data;
}

export async function skipIntroLeap(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const auth = firebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) return;
  await auth.currentUser.getIdToken(true);
  const fn = httpsCallable(firebaseFunctions(), 'skipIntroLeapCallable');
  await fn({});
}

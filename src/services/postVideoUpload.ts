import { doc, getDoc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
// Expo SDK 54+ requires importing the legacy filesystem API explicitly.
import * as FileSystem from 'expo-file-system/legacy';

import { CHALLENGE_INSTRUCTIONS } from '../content/challengeCopy';
import { getExpoExtra } from '../config/expoExtra';
import { firestore, storage } from '../firebase/firebase';
import { logEngagementMetric } from './nativeAnalytics';
import { saveVideoToCameraRoll } from './saveVideoToCameraRoll';
import {
  commitPostedVideo,
  refundRecordingAttemptIfNoPostedVideo,
  syncAttemptLedgerAfterSuccessfulPost,
} from '../state/postAttempts';
import { offerCameraRollSaveAfterPost } from '../state/pendingCameraRollSave';
import { BackgroundPostAbortedError } from '../state/backgroundPostUploadControl';
import { withRetries } from '../utils/retry';

export type PostVideoUploadParams = {
  uid: string;
  username: string;
  viewingChallengeDateKey: string;
  challengeTitle: string;
  maxDurationSeconds: number;
  clipUri: string;
  secondaryClipUri: string | null;
  dualFrontIsPrimary: boolean;
  clipSource: 'recorded' | 'demo' | 'unknown';
  autoSavePosts: boolean;
  watermarkInfo: { title: string; username: string };
};

export type PostUploadCallbacks = {
  onProgress: (pct: number) => void;
  onSaving: () => void;
  /** When true, cancel upload and skip Firestore commit (e.g. user deleted while uploading). */
  shouldAbort?: () => boolean;
  onUploadTask?: (task: ReturnType<typeof uploadBytesResumable>) => void;
};

function assertNotAborted(callbacks: PostUploadCallbacks) {
  if (callbacks.shouldAbort?.()) {
    throw new BackgroundPostAbortedError();
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const a = typeof globalThis.atob === 'function' ? globalThis.atob : undefined;
  if (!a) throw new Error('Base64 decoder is unavailable.');
  const bin = a(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function clipUriToBytes(uri: string): Promise<Uint8Array> {
  if (!uri || uri.startsWith('demo://')) {
    throw new Error('No video to upload. Record again before posting.');
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error('Recording file is no longer on this device. Record again before posting.');
  }
  try {
    // `fetch(file://...)` often fails on iOS/Android — read local clips via FileSystem instead.
    // Firebase Storage accepts a Uint8Array directly, which is more reliable in RN than Blob.
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as FileSystem.EncodingType,
    });
    const bytes = base64ToBytes(b64);
    if (bytes.byteLength < 64) {
      throw new Error('This video looks empty or unreadable. Try recording again or choose another clip.');
    }
    return bytes;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (msg.includes('network request failed') || msg.includes('network')) {
      throw new Error('Could not read your clip. Record again before posting.');
    }
    throw e;
  }
}

export async function runPostVideoUpload(
  params: PostVideoUploadParams,
  callbacks: PostUploadCallbacks
): Promise<void> {
  const {
    uid,
    username,
    viewingChallengeDateKey,
    challengeTitle,
    maxDurationSeconds,
    clipUri,
    secondaryClipUri,
    dualFrontIsPrimary,
    clipSource,
    autoSavePosts,
    watermarkInfo,
  } = params;

  const ext = 'mp4';
  const contentType = 'video/mp4';
  const UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;
  const primaryPath = `videos/${uid}/${viewingChallengeDateKey}/${Date.now()}.${ext}`;
  const primaryRef = ref(storage(), primaryPath);
  const hasSecondary = Boolean(secondaryClipUri);
  const primaryShare = hasSecondary ? 70 : 100;
  const secondaryShare = 100 - primaryShare;

  const progressGate = { lastShown: -1, lastAt: 0 };

  const reportUploadProgress = (rawPct: number) => {
    const pct = Math.min(99, Math.max(0, Math.round(rawPct)));
    if (pct >= 99) {
      callbacks.onProgress(pct);
      progressGate.lastShown = pct;
      progressGate.lastAt = Date.now();
      return;
    }
    const now = Date.now();
    if (pct - progressGate.lastShown < 4 && now - progressGate.lastAt < 280) return;
    progressGate.lastShown = pct;
    progressGate.lastAt = now;
    callbacks.onProgress(pct);
  };

  const runResumableUpload = async (
    storageRef: typeof primaryRef,
    sourceUri: string,
    scaleStart: number,
    scaleSpan: number
  ): Promise<string> => {
    assertNotAborted(callbacks);
    const bytes = await clipUriToBytes(sourceUri);
    assertNotAborted(callbacks);
    const task = uploadBytesResumable(storageRef, bytes, { contentType });
    callbacks.onUploadTask?.(task);
    await new Promise<void>((resolve, reject) => {
      const uploadTimeout = setTimeout(() => {
        try {
          task.cancel();
        } catch {
          /* ignore */
        }
        reject(
          new Error(
            'Upload timed out. Stay on Wi‑Fi and try again, or use a shorter clip.'
          )
        );
      }, UPLOAD_TIMEOUT_MS);
      task.on(
        'state_changed',
        (snapshot) => {
          if (callbacks.shouldAbort?.()) {
            clearTimeout(uploadTimeout);
            try {
              task.cancel();
            } catch {
              /* ignore */
            }
            reject(new BackgroundPostAbortedError());
            return;
          }
          const total = snapshot.totalBytes;
          if (total > 0) {
            const localPct = (100 * snapshot.bytesTransferred) / total;
            reportUploadProgress(scaleStart + (localPct * scaleSpan) / 100);
          }
        },
        (err) => {
          clearTimeout(uploadTimeout);
          const code = String((err as { code?: string })?.code ?? '').toLowerCase();
          if (code === 'storage/canceled') {
            reject(new BackgroundPostAbortedError());
            return;
          }
          reject(err);
        },
        () => {
          clearTimeout(uploadTimeout);
          resolve();
        }
      );
    });
    assertNotAborted(callbacks);
    return await getDownloadURL(task.snapshot.ref);
  };

  callbacks.onProgress(0);
  assertNotAborted(callbacks);

  const downloadUrl = await withRetries(
    () => runResumableUpload(primaryRef, clipUri, 0, primaryShare),
    {
      maxAttempts: 3,
      shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError),
    }
  );

  let secondaryDownloadUrl: string | null = null;
  let secondaryRef: typeof primaryRef | null = null;
  let secondaryPath: string | null = null;
  if (hasSecondary && secondaryClipUri) {
    secondaryPath = `videos/${uid}/${viewingChallengeDateKey}/${Date.now()}_pip.${ext}`;
    secondaryRef = ref(storage(), secondaryPath);
    try {
      secondaryDownloadUrl = await withRetries(
        () => runResumableUpload(secondaryRef!, secondaryClipUri, primaryShare, secondaryShare),
        {
          maxAttempts: 3,
          shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError),
        }
      );
    } catch (e) {
      if (e instanceof BackgroundPostAbortedError) throw e;
      try {
        await deleteObject(primaryRef);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  assertNotAborted(callbacks);
  callbacks.onProgress(100);
  callbacks.onSaving();
  assertNotAborted(callbacks);

  try {
    const requireMod = Boolean(getExpoExtra().requirePostModeration);
    let posterPhotoUrl = '';
    try {
      const userSnap = await getDoc(doc(firestore(), 'users', uid));
      posterPhotoUrl = String(userSnap.data()?.photoUrl ?? '').trim();
    } catch {
      // optional denormalized avatar on the leap doc
    }
    await withRetries(
      () =>
        commitPostedVideo({
          payload: {
            uid,
            username: username.trim() || 'user',
            ...(posterPhotoUrl ? { photoUrl: posterPhotoUrl } : {}),
            challengeDate: viewingChallengeDateKey,
            challengeTitle,
            challengeSubtitle: CHALLENGE_INSTRUCTIONS,
            prompt: challengeTitle,
            maxDurationSeconds,
            source: clipSource,
            url: downloadUrl,
            storagePath: primaryPath,
            ...(secondaryDownloadUrl && secondaryPath
              ? {
                  secondaryUrl: secondaryDownloadUrl,
                  secondaryStoragePath: secondaryPath,
                  ...(dualFrontIsPrimary ? { dualFrontIsPrimary: true } : {}),
                }
              : {}),
            moderationStatus: requireMod ? 'pending' : 'approved',
          },
        }),
      { maxAttempts: 3 }
    );
  } catch (e) {
    if (e instanceof BackgroundPostAbortedError) throw e;
    try {
      await deleteObject(primaryRef);
    } catch {
      // ignore cleanup failures
    }
    if (secondaryRef) {
      try {
        await deleteObject(secondaryRef);
      } catch {
        /* ignore */
      }
    }
    throw e;
  }

  const recordedForSave = clipSource === 'recorded';
  const clipUriForOffer = recordedForSave ? clipUri : null;

  void logEngagementMetric('posting', { challenge_date: viewingChallengeDateKey });

  try {
    await syncAttemptLedgerAfterSuccessfulPost({
      uid,
      challengeDate: viewingChallengeDateKey,
    });
  } catch {
    // ledger will self-heal on next post; video doc is the source of truth
  }

  void updateDoc(doc(firestore(), 'users', uid), {
    challengesCompleted: increment(1),
    updatedAt: serverTimestamp(),
  }).catch(() => {});

  if (recordedForSave && autoSavePosts && clipUriForOffer) {
    void saveVideoToCameraRoll(clipUriForOffer, watermarkInfo).catch(() => {});
  } else if (recordedForSave && !autoSavePosts && clipUriForOffer) {
    void offerCameraRollSaveAfterPost(clipUriForOffer, watermarkInfo);
  }
}

export async function refundPostAttemptIfFailed(args: { uid: string; challengeDate: string }) {
  await refundRecordingAttemptIfNoPostedVideo(args);
}

import { doc, getDoc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

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
};

async function clipUriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(
      `Could not read your clip (HTTP ${res.status}). Try recording again or pick another video.`
    );
  }
  const blob = await res.blob();
  if (!blob || blob.size < 64) {
    throw new Error('This video looks empty or unreadable. Try recording again or choose another clip.');
  }
  return blob;
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
    const blob = await clipUriToBlob(sourceUri);
    const task = uploadBytesResumable(storageRef, blob, { contentType });
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
          const total = snapshot.totalBytes;
          if (total > 0) {
            const localPct = (100 * snapshot.bytesTransferred) / total;
            reportUploadProgress(scaleStart + (localPct * scaleSpan) / 100);
          }
        },
        (err) => {
          clearTimeout(uploadTimeout);
          reject(err);
        },
        () => {
          clearTimeout(uploadTimeout);
          resolve();
        }
      );
    });
    return await getDownloadURL(task.snapshot.ref);
  };

  callbacks.onProgress(0);

  const downloadUrl = await withRetries(
    () => runResumableUpload(primaryRef, clipUri, 0, primaryShare),
    { maxAttempts: 3 }
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
        { maxAttempts: 3 }
      );
    } catch (e) {
      try {
        await deleteObject(primaryRef);
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  callbacks.onProgress(100);
  callbacks.onSaving();

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

import { doc, getDoc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  ref,
  uploadBytesResumable,
} from 'firebase/storage';
// Expo SDK 54+ requires importing the legacy filesystem API explicitly.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { CHALLENGE_INSTRUCTIONS } from '../content/challengeCopy';
import { getExpoExtra } from '../config/expoExtra';
import { firestore, storage } from '../firebase/firebase';
import { localMediaFileExists } from '../lib/stageFeedPlaybackClip';
import { logEngagementMetric, logExperimentEvent } from './nativeAnalytics';
import { saveVideoToCameraRoll } from './saveVideoToCameraRoll';
import {
  commitPostedVideo,
  refundRecordingAttemptIfNoPostedVideo,
  syncAttemptLedgerAfterSuccessfulPost,
} from '../state/postAttempts';
import { offerCameraRollSaveAfterPost } from '../state/pendingCameraRollSave';
import { BackgroundPostAbortedError } from '../state/backgroundPostUploadControl';
import { withRetries } from '../utils/retry';
import { createLeapUploadUrls } from './leapUploadUrls';
import type { CoLeapInviteePick } from '../types/coLeap';
import { normalizeCoLeapInvitees } from '../types/coLeap';

export type LeapMediaType = 'video' | 'photo';

export type PostVideoUploadParams = {
  uid: string;
  username: string;
  viewingChallengeDateKey: string;
  challengeTitle: string;
  maxDurationSeconds: number;
  clipUri: string;
  secondaryClipUri: string | null;
  /** Camera/library URI from before staging. Retry uses this if the staged copy was deleted. */
  sourceClipUri?: string;
  sourceSecondaryClipUri?: string | null;
  dualFrontIsPrimary: boolean;
  clipSource: 'recorded' | 'demo' | 'library' | 'unknown';
  /** Defaults to video. Photos are allowed for proof / camera-roll leaps. */
  mediaType?: LeapMediaType;
  autoSavePosts: boolean;
  watermarkInfo: { title: string; username: string };
  /** Stable Storage paths so a killed app can resume the same objects. */
  primaryStoragePath?: string;
  secondaryStoragePath?: string | null;
  /** Optional Co-Leap invitees (max 3). They confirm separately for posted-today credit. */
  coLeapInvitees?: CoLeapInviteePick[];
};

export type CancelableUpload = {
  cancel: () => void;
};

export type PostUploadCallbacks = {
  onProgress: (pct: number) => void;
  onSaving: () => void;
  /** When true, cancel upload and skip Firestore commit (e.g. user deleted while uploading). */
  shouldAbort?: () => boolean;
  onUploadTask?: (task: CancelableUpload) => void;
  /** Persist allocated Storage paths as soon as they are known (for kill/resume). */
  onStoragePaths?: (paths: {
    primaryStoragePath: string;
    secondaryStoragePath: string | null;
  }) => void;
};

function assertNotAborted(callbacks: PostUploadCallbacks) {
  if (callbacks.shouldAbort?.()) {
    throw new BackgroundPostAbortedError();
  }
}

function supportsNativeBackgroundUpload() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function allocateLeapStoragePaths(args: {
  uid: string;
  challengeDate: string;
  hasSecondary: boolean;
  mediaType?: LeapMediaType;
}): { primaryStoragePath: string; secondaryStoragePath: string | null } {
  const stamp = Date.now();
  const mediaType = args.mediaType === 'photo' ? 'photo' : 'video';
  const ext = mediaType === 'photo' ? 'jpg' : 'mp4';
  const primaryStoragePath = `videos/${args.uid}/${args.challengeDate}/${stamp}.${ext}`;
  const secondaryStoragePath =
    args.hasSecondary && mediaType === 'video'
      ? `videos/${args.uid}/${args.challengeDate}/${stamp}_pip.mp4`
      : null;
  return { primaryStoragePath, secondaryStoragePath };
}

/** Read local clip as Blob via XHR ΓÇö streams to upload without base64 heap blow-up. */
function uriToBlobViaXhr(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const blob = xhr.response;
      if (blob instanceof Blob && blob.size >= 64) {
        resolve(blob);
        return;
      }
      reject(new Error('This video looks empty or unreadable. Try recording again or choose another clip.'));
    };
    xhr.onerror = () => reject(new Error('Could not read your clip. Record again before posting.'));
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const a = typeof globalThis.atob === 'function' ? globalThis.atob : undefined;
  if (!a) throw new Error('Base64 decoder is unavailable.');
  const bin = a(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function uriToBytesFallback(uri: string): Promise<Uint8Array> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: 'base64' as FileSystem.EncodingType,
  });
  const bytes = base64ToBytes(b64);
  if (bytes.byteLength < 64) {
    throw new Error('This video looks empty or unreadable. Try recording again or choose another clip.');
  }
  return bytes;
}

type UploadPayload = Blob | Uint8Array;

async function resolveLocalUploadUri(preferred: string, fallback?: string | null): Promise<string> {
  const candidates = [preferred, fallback].filter((u, i, all): u is string => {
    if (!u || u.startsWith('demo://')) return false;
    return all.indexOf(u) === i;
  });
  for (const uri of candidates) {
    if (await localMediaFileExists(uri)) return uri;
  }
  throw new Error('Recording file is no longer on this device. Record again before posting.');
}

async function clipUriToUploadPayload(uri: string): Promise<UploadPayload> {
  if (!uri || uri.startsWith('demo://')) {
    throw new Error('No video to upload. Record again before posting.');
  }
  if (!(await localMediaFileExists(uri))) {
    throw new Error('Recording file is no longer on this device. Record again before posting.');
  }
  try {
    return await uriToBlobViaXhr(uri);
  } catch (xhrErr) {
    try {
      const res = await fetch(uri);
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size >= 64) return blob;
      }
    } catch {
      /* try base64 last */
    }
    try {
      return await uriToBytesFallback(uri);
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      if (msg.includes('network request failed') || msg.includes('network')) {
        throw new Error('Could not read your clip. Record again before posting.');
      }
      throw xhrErr instanceof Error ? xhrErr : e;
    }
  }
}

async function storageObjectExists(storagePath: string): Promise<boolean> {
  try {
    await getMetadata(ref(storage(), storagePath));
    return true;
  } catch {
    return false;
  }
}

async function uploadViaNativeBackground(args: {
  localUri: string;
  uploadUrl: string;
  contentType: string;
  storagePath: string;
  scaleStart: number;
  scaleSpan: number;
  reportUploadProgress: (rawPct: number) => void;
  callbacks: PostUploadCallbacks;
}): Promise<string> {
  const {
    localUri,
    uploadUrl,
    contentType,
    storagePath,
    scaleStart,
    scaleSpan,
    reportUploadProgress,
    callbacks,
  } = args;

  assertNotAborted(callbacks);

  if (await storageObjectExists(storagePath)) {
    reportUploadProgress(scaleStart + scaleSpan);
    return await getDownloadURL(ref(storage(), storagePath));
  }

  if (!(await localMediaFileExists(localUri))) {
    throw new Error('Recording file is no longer on this device. Record again before posting.');
  }

  const UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;
  let settled = false;

  const task = FileSystem.createUploadTask(
    uploadUrl,
    localUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      headers: {
        'Content-Type': contentType,
      },
    },
    (data) => {
      if (callbacks.shouldAbort?.()) {
        void task.cancelAsync().catch(() => {});
        return;
      }
      const total = data.totalBytesExpectedToSend;
      if (total > 0) {
        const localPct = (100 * data.totalBytesSent) / total;
        reportUploadProgress(scaleStart + (localPct * scaleSpan) / 100);
      }
    }
  );

  callbacks.onUploadTask?.({
    cancel: () => {
      void task.cancelAsync().catch(() => {});
    },
  });

  const uploadTimeout = setTimeout(() => {
    if (settled) return;
    void task.cancelAsync().catch(() => {});
  }, UPLOAD_TIMEOUT_MS);

  try {
    const result = await task.uploadAsync();
    settled = true;
    clearTimeout(uploadTimeout);
    assertNotAborted(callbacks);

    if (!result) {
      throw new BackgroundPostAbortedError();
    }
    if (result.status < 200 || result.status >= 300) {
      throw new Error(
        `Upload failed (${result.status}). Stay on WiΓÇæFi and try again, or use a shorter clip.`
      );
    }

    reportUploadProgress(scaleStart + scaleSpan);
    return await getDownloadURL(ref(storage(), storagePath));
  } catch (e) {
    settled = true;
    clearTimeout(uploadTimeout);
    if (e instanceof BackgroundPostAbortedError) throw e;
    if (callbacks.shouldAbort?.()) throw new BackgroundPostAbortedError();
    // Native background transfer may finish after a kill/suspend ΓÇö recover if object landed.
    if (await storageObjectExists(storagePath)) {
      reportUploadProgress(scaleStart + scaleSpan);
      return await getDownloadURL(ref(storage(), storagePath));
    }
    const msg = String((e as Error)?.message ?? e).toLowerCase();
    if (msg.includes('cancel') || msg.includes('abort')) {
      throw new BackgroundPostAbortedError();
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
    dualFrontIsPrimary,
    clipSource,
    autoSavePosts,
    watermarkInfo,
  } = params;

  const clipUri = await resolveLocalUploadUri(params.clipUri, params.sourceClipUri);
  const secondaryClipUri =
    params.secondaryClipUri || params.sourceSecondaryClipUri
      ? await resolveLocalUploadUri(
          params.secondaryClipUri || params.sourceSecondaryClipUri || '',
          params.sourceSecondaryClipUri
        )
      : null;

  const mediaType: LeapMediaType = params.mediaType === 'photo' ? 'photo' : 'video';
  const contentType = mediaType === 'photo' ? 'image/jpeg' : 'video/mp4';
  const UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;
  const hasSecondary = mediaType === 'video' && Boolean(secondaryClipUri);
  const allocated =
    params.primaryStoragePath != null && params.primaryStoragePath.length > 0
      ? {
          primaryStoragePath: params.primaryStoragePath,
          secondaryStoragePath: params.secondaryStoragePath ?? null,
        }
      : allocateLeapStoragePaths({
          uid,
          challengeDate: viewingChallengeDateKey,
          hasSecondary,
          mediaType,
        });

  const primaryPath = allocated.primaryStoragePath;
  const secondaryPath = hasSecondary
    ? allocated.secondaryStoragePath ??
      allocateLeapStoragePaths({
        uid,
        challengeDate: viewingChallengeDateKey,
        hasSecondary: true,
        mediaType: 'video',
      }).secondaryStoragePath
    : null;

  callbacks.onStoragePaths?.({
    primaryStoragePath: primaryPath,
    secondaryStoragePath: secondaryPath,
  });

  const primaryRef = ref(storage(), primaryPath);
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

  callbacks.onProgress(0);
  assertNotAborted(callbacks);

  let downloadUrl: string;
  let secondaryDownloadUrl: string | null = null;
  let secondaryRef: ReturnType<typeof ref> | null = secondaryPath
    ? ref(storage(), secondaryPath)
    : null;

  const cleanupOrphans = async () => {
    try {
      await deleteObject(primaryRef);
    } catch {
      /* ignore */
    }
    if (secondaryRef) {
      try {
        await deleteObject(secondaryRef);
      } catch {
        /* ignore */
      }
    }
  };

  const runJsResumableUploads = async () => {
    const payloadCache = new Map<string, UploadPayload>();
    const loadUploadPayload = async (sourceUri: string): Promise<UploadPayload> => {
      const cached = payloadCache.get(sourceUri);
      if (cached) return cached;
      callbacks.onProgress(1);
      const payload = await clipUriToUploadPayload(sourceUri);
      payloadCache.set(sourceUri, payload);
      return payload;
    };

    const runResumableUpload = async (
      storageRef: ReturnType<typeof ref>,
      payload: UploadPayload,
      scaleStart: number,
      scaleSpan: number
    ): Promise<string> => {
      assertNotAborted(callbacks);
      if (await storageObjectExists(storageRef.fullPath)) {
        reportUploadProgress(scaleStart + scaleSpan);
        return await getDownloadURL(storageRef);
      }
      const task = uploadBytesResumable(storageRef, payload, { contentType });
      callbacks.onUploadTask?.({
        cancel: () => {
          try {
            task.cancel();
          } catch {
            /* ignore */
          }
        },
      });
      await new Promise<void>((resolve, reject) => {
        const uploadTimeout = setTimeout(() => {
          try {
            task.cancel();
          } catch {
            /* ignore */
          }
          reject(
            new Error('Upload timed out. Stay on WiΓÇæFi and try again, or use a shorter clip.')
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

    const [primaryPayload, secondaryPayload] = await Promise.all([
      loadUploadPayload(clipUri),
      hasSecondary && secondaryClipUri
        ? loadUploadPayload(secondaryClipUri)
        : Promise.resolve(null),
    ]);
    assertNotAborted(callbacks);

    const uploadWithRetries = (
      storageRef: ReturnType<typeof ref>,
      payload: UploadPayload,
      scaleStart: number,
      scaleSpan: number
    ) =>
      withRetries(() => runResumableUpload(storageRef, payload, scaleStart, scaleSpan), {
        maxAttempts: 3,
        shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError),
      });

    if (secondaryRef && secondaryPayload) {
      return await Promise.all([
        uploadWithRetries(primaryRef, primaryPayload, 0, primaryShare),
        uploadWithRetries(secondaryRef, secondaryPayload, primaryShare, secondaryShare),
      ]);
    }
    const primaryUrl = await uploadWithRetries(primaryRef, primaryPayload, 0, primaryShare);
    return [primaryUrl, null] as const;
  };

  try {
    let usedNative = false;
    if (supportsNativeBackgroundUpload()) {
      try {
        const urls = await withRetries(
          () =>
            createLeapUploadUrls({
              challengeDate: viewingChallengeDateKey,
              primaryStoragePath: primaryPath,
              secondaryStoragePath: secondaryPath,
            }),
          {
            maxAttempts: 2,
            shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError),
          }
        );
        assertNotAborted(callbacks);
        usedNative = true;

        const uploadPrimary = () =>
          withRetries(
            () =>
              uploadViaNativeBackground({
                localUri: clipUri,
                uploadUrl: urls.primary.uploadUrl,
                contentType: urls.contentType || contentType,
                storagePath: primaryPath,
                scaleStart: 0,
                scaleSpan: primaryShare,
                reportUploadProgress,
                callbacks,
              }),
            {
              maxAttempts: 3,
              shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError),
            }
          );

        if (secondaryPath && secondaryClipUri && urls.secondary) {
          const uploadSecondary = () =>
            withRetries(
              () =>
                uploadViaNativeBackground({
                  localUri: secondaryClipUri,
                  uploadUrl: urls.secondary!.uploadUrl,
                  contentType: urls.contentType || contentType,
                  storagePath: secondaryPath,
                  scaleStart: primaryShare,
                  scaleSpan: secondaryShare,
                  reportUploadProgress,
                  callbacks,
                }),
              {
                maxAttempts: 3,
                shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError),
              }
            );
          [downloadUrl, secondaryDownloadUrl] = await Promise.all([
            uploadPrimary(),
            uploadSecondary(),
          ]);
        } else {
          downloadUrl = await uploadPrimary();
        }
      } catch (nativeErr) {
        if (nativeErr instanceof BackgroundPostAbortedError) throw nativeErr;
        // Callable not deployed yet, or signed PUT failed ΓÇö fall back to in-process upload.
        usedNative = false;
      }
    }

    if (!usedNative) {
      [downloadUrl, secondaryDownloadUrl] = await runJsResumableUploads();
    }
  } catch (e) {
    if (e instanceof BackgroundPostAbortedError) throw e;
    await cleanupOrphans();
    throw e;
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
    const coLeapInvitees = normalizeCoLeapInvitees(
      params.coLeapInvitees?.filter((p) => p.uid !== uid)
    );
    await withRetries(
      () => {
        assertNotAborted(callbacks);
        return commitPostedVideo({
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
            ...(mediaType === 'photo' ? { mediaType: 'photo' as const } : {}),
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
            ...(coLeapInvitees.length > 0 ? { coLeapInvitees } : {}),
          },
        });
      },
      { maxAttempts: 3, shouldRetry: (err) => !(err instanceof BackgroundPostAbortedError) }
    );
  } catch (e) {
    if (e instanceof BackgroundPostAbortedError) throw e;
    await cleanupOrphans();
    throw e;
  }

  const recordedForSave = clipSource === 'recorded' && mediaType === 'video';
  const clipUriForOffer = recordedForSave ? clipUri : null;

  void logEngagementMetric('posting', { challenge_date: viewingChallengeDateKey });
  void logExperimentEvent('post_created', { challenge_date: viewingChallengeDateKey });

  assertNotAborted(callbacks);

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

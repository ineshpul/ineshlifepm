import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
// Expo SDK 54+ requires importing the legacy filesystem API explicitly.
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { storage } from '../firebase/firebase';
import { offerCameraRollSaveAfterPost } from '../state/pendingCameraRollSave';
import { BackgroundPostAbortedError } from '../state/backgroundPostUploadControl';
import type { BestPartMediaType } from '../types/bestPart';
import { formatNyDateKeyShort } from '../utils/nyTime';
import { commitBestPartPost } from './bestPartPosts';
import { createBestPartUploadUrls } from './bestPartUploadUrls';
import { saveVideoToCameraRoll } from './saveVideoToCameraRoll';
import { withRetries } from '../utils/retry';

const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
/** Per-file cap — dual 30s phone video can exceed 100MB/stream at high quality. */
const MAX_VIDEO_BYTES = 400 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 12 * 60 * 1000;

export type CancelableUpload = {
  cancel: () => void;
};

export type BestPartPostUploadParams = {
  uid: string;
  username: string;
  caption: string;
  mediaType: BestPartMediaType;
  localUri: string;
  secondaryUri?: string | null;
  dualFrontIsPrimary?: boolean;
  isPrivate: boolean;
  durationSeconds?: number;
  dateKey: string;
  /** When true, watermarked copy is saved to camera roll after a video post. */
  autoSavePosts?: boolean;
  /** Stable Storage paths so a killed app can resume the same objects. */
  primaryStoragePath?: string;
  secondaryStoragePath?: string | null;
};

export type BestPartPostUploadCallbacks = {
  onProgress?: (pct: number) => void;
  onSaving?: () => void;
  shouldAbort?: () => boolean;
  onUploadTask?: (task: CancelableUpload) => void;
  onStoragePaths?: (paths: {
    primaryStoragePath: string;
    secondaryStoragePath: string | null;
  }) => void;
};

function assertNotAborted(callbacks: BestPartPostUploadCallbacks) {
  if (callbacks.shouldAbort?.()) throw new BackgroundPostAbortedError();
}

function supportsNativeBackgroundUpload() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function allocateBestPartStoragePaths(args: {
  uid: string;
  dateKey: string;
  mediaType: BestPartMediaType;
  hasSecondary: boolean;
}): { primaryStoragePath: string; secondaryStoragePath: string | null } {
  const ext = args.mediaType === 'photo' ? 'jpg' : 'mp4';
  const stamp = Date.now();
  const primaryStoragePath = `bestParts/${args.uid}/${args.dateKey}/${stamp}.${ext}`;
  const secondaryStoragePath = args.hasSecondary
    ? `bestParts/${args.uid}/${args.dateKey}/${stamp}_pip.${ext}`
    : null;
  return { primaryStoragePath, secondaryStoragePath };
}

function uriToBlobViaXhr(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      const blob = xhr.response;
      if (blob instanceof Blob && blob.size >= 32) {
        resolve(blob);
        return;
      }
      reject(new Error('This capture looks empty. Try again.'));
    };
    xhr.onerror = () => reject(new Error('Could not read your capture. Try again.'));
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

async function uriToUploadBody(uri: string): Promise<Blob | Uint8Array> {
  try {
    return await uriToBlobViaXhr(uri);
  } catch {
    const b64 = await FileSystem.readAsStringAsync(uri, {
      encoding: 'base64' as FileSystem.EncodingType,
    });
    return base64ToBytes(b64);
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

async function assertLocalMediaSize(localUri: string, mediaType: BestPartMediaType) {
  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error('Capture file is no longer on this device.');
  }
  const size = typeof info.size === 'number' ? info.size : 0;
  const max = mediaType === 'photo' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (size > max) {
    throw new Error(mediaType === 'photo' ? 'Photo is too large.' : 'Video is too large.');
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
  callbacks: BestPartPostUploadCallbacks;
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

  const info = await FileSystem.getInfoAsync(localUri);
  if (!info.exists) {
    throw new Error('Capture file is no longer on this device.');
  }

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
        `Upload failed (${result.status}). Stay on Wi-Fi and try again, or use a smaller file.`
      );
    }

    reportUploadProgress(scaleStart + scaleSpan);
    return await getDownloadURL(ref(storage(), storagePath));
  } catch (e) {
    settled = true;
    clearTimeout(uploadTimeout);
    if (e instanceof BackgroundPostAbortedError) throw e;
    if (callbacks.shouldAbort?.()) throw new BackgroundPostAbortedError();
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

async function uploadViaJsResumable(args: {
  localUri: string;
  storagePath: string;
  contentType: string;
  mediaType: BestPartMediaType;
  scaleStart: number;
  scaleSpan: number;
  reportUploadProgress: (rawPct: number) => void;
  callbacks: BestPartPostUploadCallbacks;
}): Promise<string> {
  const {
    localUri,
    storagePath,
    contentType,
    mediaType,
    scaleStart,
    scaleSpan,
    reportUploadProgress,
    callbacks,
  } = args;

  assertNotAborted(callbacks);
  const sref = ref(storage(), storagePath);
  if (await storageObjectExists(storagePath)) {
    reportUploadProgress(scaleStart + scaleSpan);
    return await getDownloadURL(sref);
  }

  await assertLocalMediaSize(localUri, mediaType);
  const body = await uriToUploadBody(localUri);
  const size = body instanceof Blob ? body.size : body.byteLength;
  const max = mediaType === 'photo' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
  if (size > max) {
    throw new Error(mediaType === 'photo' ? 'Photo is too large.' : 'Video is too large.');
  }

  const task = uploadBytesResumable(sref, body, { contentType });
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
      reject(new Error('Upload timed out. Stay on Wi-Fi and try again.'));
    }, UPLOAD_TIMEOUT_MS);

    task.on(
      'state_changed',
      (snap: UploadTaskSnapshot) => {
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
        const total = snap.totalBytes;
        if (total > 0) {
          const localPct = (100 * snap.bytesTransferred) / total;
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
}

/** Upload media + commit Firestore doc (one per uid/dateKey; retake merges). */
export async function runBestPartPostUpload(
  params: BestPartPostUploadParams,
  callbacks: BestPartPostUploadCallbacks = {}
): Promise<{ id: string; dateKey: string }> {
  const hasSecondary = Boolean(params.secondaryUri);
  const contentType = params.mediaType === 'photo' ? 'image/jpeg' : 'video/mp4';
  const allocated =
    params.primaryStoragePath != null && params.primaryStoragePath.length > 0
      ? {
          primaryStoragePath: params.primaryStoragePath,
          secondaryStoragePath: params.secondaryStoragePath ?? null,
        }
      : allocateBestPartStoragePaths({
          uid: params.uid,
          dateKey: params.dateKey,
          mediaType: params.mediaType,
          hasSecondary,
        });

  const primaryPath = allocated.primaryStoragePath;
  const secondaryPath = hasSecondary
    ? allocated.secondaryStoragePath ??
      allocateBestPartStoragePaths({
        uid: params.uid,
        dateKey: params.dateKey,
        mediaType: params.mediaType,
        hasSecondary: true,
      }).secondaryStoragePath
    : null;

  callbacks.onStoragePaths?.({
    primaryStoragePath: primaryPath,
    secondaryStoragePath: secondaryPath,
  });

  const primaryShare = hasSecondary ? 55 : 100;
  const secondaryShare = 100 - primaryShare;
  const progressGate = { lastShown: -1, lastAt: 0 };

  const reportUploadProgress = (rawPct: number) => {
    const pct = Math.min(99, Math.max(0, Math.round(rawPct)));
    if (pct >= 99) {
      callbacks.onProgress?.(pct);
      progressGate.lastShown = pct;
      progressGate.lastAt = Date.now();
      return;
    }
    const now = Date.now();
    if (pct - progressGate.lastShown < 4 && now - progressGate.lastAt < 280) return;
    progressGate.lastShown = pct;
    progressGate.lastAt = now;
    callbacks.onProgress?.(pct);
  };

  callbacks.onProgress?.(0);
  assertNotAborted(callbacks);

  await assertLocalMediaSize(params.localUri, params.mediaType);
  if (params.secondaryUri) {
    await assertLocalMediaSize(params.secondaryUri, params.mediaType);
  }

  let primaryUrl: string;
  let secondaryUrl: string | undefined;
  const primaryRef = ref(storage(), primaryPath);
  const secondaryRef = secondaryPath ? ref(storage(), secondaryPath) : null;

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

  try {
    let usedNative = false;
    if (supportsNativeBackgroundUpload()) {
      try {
        const urls = await withRetries(
          () =>
            createBestPartUploadUrls({
              dateKey: params.dateKey,
              mediaType: params.mediaType,
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
                localUri: params.localUri,
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

        if (secondaryPath && params.secondaryUri && urls.secondary) {
          const uploadSecondary = () =>
            withRetries(
              () =>
                uploadViaNativeBackground({
                  localUri: params.secondaryUri!,
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
          const [p, s] = await Promise.all([uploadPrimary(), uploadSecondary()]);
          primaryUrl = p;
          secondaryUrl = s;
        } else {
          primaryUrl = await uploadPrimary();
        }
      } catch (nativeErr) {
        if (nativeErr instanceof BackgroundPostAbortedError) throw nativeErr;
        usedNative = false;
      }
    }

    if (!usedNative) {
      primaryUrl = await withRetries(
        () =>
          uploadViaJsResumable({
            localUri: params.localUri,
            storagePath: primaryPath,
            contentType,
            mediaType: params.mediaType,
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
      if (secondaryPath && params.secondaryUri) {
        secondaryUrl = await withRetries(
          () =>
            uploadViaJsResumable({
              localUri: params.secondaryUri!,
              storagePath: secondaryPath,
              contentType,
              mediaType: params.mediaType,
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
      }
    }
  } catch (e) {
    if (e instanceof BackgroundPostAbortedError) throw e;
    await cleanupOrphans();
    throw e;
  }

  assertNotAborted(callbacks);
  callbacks.onProgress?.(100);
  callbacks.onSaving?.();
  assertNotAborted(callbacks);

  try {
    const result = await commitBestPartPost({
      uid: params.uid,
      username: params.username,
      caption: params.caption,
      mediaType: params.mediaType,
      url: primaryUrl!,
      storagePath: primaryPath,
      secondaryUrl,
      secondaryStoragePath: secondaryUrl ? secondaryPath ?? undefined : undefined,
      dualFrontIsPrimary: secondaryUrl ? params.dualFrontIsPrimary === true : undefined,
      isPrivate: params.isPrivate,
      durationSeconds: params.mediaType === 'video' ? params.durationSeconds : undefined,
      dateKey: params.dateKey,
    });

    // Camera-roll offer / auto-save for videos — date + Leap logo watermark only.
    if (params.mediaType === 'video' && params.localUri) {
      const watermarkInfo = {
        title: formatNyDateKeyShort(params.dateKey),
        username: params.username.trim() || 'user',
        variant: 'bestPart' as const,
      };
      if (params.autoSavePosts) {
        void saveVideoToCameraRoll(params.localUri, watermarkInfo).catch(() => undefined);
      } else {
        void offerCameraRollSaveAfterPost(params.localUri, watermarkInfo);
      }
    }

    return result;
  } catch (e) {
    if (e instanceof BackgroundPostAbortedError) throw e;
    await cleanupOrphans();
    throw e;
  }
}

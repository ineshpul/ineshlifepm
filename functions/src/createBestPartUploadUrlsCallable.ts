import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { CALLABLE_OPTIONS } from './callableOptions';
import { nyDateKeyFromMs } from './timeKeys';

const SIGNED_URL_TTL_MS = 2 * 60 * 60 * 1000;

function normalizeDateKey(raw: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return '';
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function assertOwnedBestPartPath(
  uid: string,
  dateKey: string,
  storagePath: string,
  mediaType: 'photo' | 'video'
) {
  const prefix = `bestParts/${uid}/${dateKey}/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes('..') || storagePath.length > 240) {
    throw new HttpsError('invalid-argument', 'Invalid storage path.');
  }
  if (mediaType === 'photo') {
    if (!storagePath.endsWith('.jpg') && !storagePath.endsWith('.jpeg')) {
      throw new HttpsError('invalid-argument', 'Only jpeg uploads are supported for photos.');
    }
  } else if (!storagePath.endsWith('.mp4')) {
    throw new HttpsError('invalid-argument', 'Only mp4 uploads are supported for video.');
  }
}

async function signWriteUrl(storagePath: string, contentType: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const [url] = await bucket.file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType,
  });
  return url;
}

type CreateBestPartUploadUrlsRequest = {
  dateKey?: string;
  mediaType?: string;
  primaryStoragePath?: string;
  secondaryStoragePath?: string | null;
};

/**
 * Mint short-lived GCS signed write URLs so Best Part media can upload via
 * Expo FileSystem background transfers after the user leaves the app.
 */
export const createBestPartUploadUrlsCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const data = (request.data ?? {}) as CreateBestPartUploadUrlsRequest;
  const dateKey = normalizeDateKey(String(data.dateKey ?? ''));
  if (!dateKey) throw new HttpsError('invalid-argument', 'dateKey required');

  const expected = nyDateKeyFromMs(Date.now());
  if (dateKey !== expected) {
    throw new HttpsError('invalid-argument', 'Day mismatch — refresh and try again.');
  }

  const mediaType = data.mediaType === 'photo' || data.mediaType === 'video' ? data.mediaType : null;
  if (!mediaType) throw new HttpsError('invalid-argument', 'mediaType required');

  const contentType = mediaType === 'photo' ? 'image/jpeg' : 'video/mp4';
  const primaryStoragePath = String(data.primaryStoragePath ?? '').trim();
  assertOwnedBestPartPath(uid, dateKey, primaryStoragePath, mediaType);

  const secondaryRaw = data.secondaryStoragePath;
  const secondaryStoragePath =
    secondaryRaw == null || secondaryRaw === '' ? null : String(secondaryRaw).trim();
  if (secondaryStoragePath) {
    assertOwnedBestPartPath(uid, dateKey, secondaryStoragePath, mediaType);
  }

  const [primaryUploadUrl, secondaryUploadUrl] = await Promise.all([
    signWriteUrl(primaryStoragePath, contentType),
    secondaryStoragePath ? signWriteUrl(secondaryStoragePath, contentType) : Promise.resolve(null),
  ]);

  return {
    contentType,
    expiresAtMs: Date.now() + SIGNED_URL_TTL_MS,
    primary: {
      storagePath: primaryStoragePath,
      uploadUrl: primaryUploadUrl,
    },
    secondary: secondaryStoragePath
      ? {
          storagePath: secondaryStoragePath,
          uploadUrl: secondaryUploadUrl as string,
        }
      : null,
  };
});

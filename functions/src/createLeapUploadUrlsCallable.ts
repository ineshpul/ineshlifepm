import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { CALLABLE_OPTIONS } from './callableOptions';
import { leapChallengeDateKeyFromMs } from './timeKeys';

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

function contentTypeForPath(storagePath: string): string {
  if (storagePath.endsWith('.jpg') || storagePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'video/mp4';
}

function assertOwnedLeapPath(uid: string, challengeDate: string, storagePath: string) {
  const prefix = `videos/${uid}/${challengeDate}/`;
  if (!storagePath.startsWith(prefix) || storagePath.includes('..') || storagePath.length > 240) {
    throw new HttpsError('invalid-argument', 'Invalid storage path.');
  }
  if (
    !storagePath.endsWith('.mp4') &&
    !storagePath.endsWith('.jpg') &&
    !storagePath.endsWith('.jpeg')
  ) {
    throw new HttpsError('invalid-argument', 'Only mp4 or jpeg uploads are supported.');
  }
}

async function signWriteUrl(storagePath: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const [url] = await bucket.file(storagePath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + SIGNED_URL_TTL_MS,
    contentType: contentTypeForPath(storagePath),
  });
  return url;
}

type CreateLeapUploadUrlsRequest = {
  challengeDate?: string;
  primaryStoragePath?: string;
  secondaryStoragePath?: string | null;
};

/**
 * Mint short-lived GCS signed write URLs so the app can upload Leap clips via
 * Expo FileSystem background transfers after the user leaves the app.
 */
export const createLeapUploadUrlsCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const data = (request.data ?? {}) as CreateLeapUploadUrlsRequest;
  const challengeDate = normalizeDateKey(String(data.challengeDate ?? ''));
  if (!challengeDate) throw new HttpsError('invalid-argument', 'challengeDate required');

  const expected = leapChallengeDateKeyFromMs(Date.now());
  if (challengeDate !== expected) {
    throw new HttpsError('invalid-argument', 'Challenge day mismatch ΓÇö refresh and try again.');
  }

  const primaryStoragePath = String(data.primaryStoragePath ?? '').trim();
  assertOwnedLeapPath(uid, challengeDate, primaryStoragePath);

  const secondaryRaw = data.secondaryStoragePath;
  const secondaryStoragePath =
    secondaryRaw == null || secondaryRaw === '' ? null : String(secondaryRaw).trim();
  if (secondaryStoragePath) {
    assertOwnedLeapPath(uid, challengeDate, secondaryStoragePath);
    if (!secondaryStoragePath.endsWith('.mp4')) {
      throw new HttpsError('invalid-argument', 'PIP companion must be mp4.');
    }
  }

  const contentType = contentTypeForPath(primaryStoragePath);
  const [primaryUploadUrl, secondaryUploadUrl] = await Promise.all([
    signWriteUrl(primaryStoragePath),
    secondaryStoragePath ? signWriteUrl(secondaryStoragePath) : Promise.resolve(null),
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

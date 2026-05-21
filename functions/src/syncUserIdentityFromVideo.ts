import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { isPlaceholderUsername, usernameClaimDocId } from './usernameClaimId';

const POST_COLLECTION = 'videos';

export function photoUrlFromVideo(data: Record<string, unknown>): string {
  return String(data.photoUrl ?? data.photoURL ?? data.avatarUrl ?? '').trim();
}

export function usernameFromVideo(data: Record<string, unknown>): string {
  const u = String(data.username ?? '').trim();
  return isPlaceholderUsername(u) ? '' : u;
}

/** True when leaperboard would show Anonymous / no @handle without a video fallback. */
export function userNeedsIdentitySync(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  const username = String(data.username ?? '').trim();
  const displayName = String(data.displayName ?? '').trim();
  if (!isPlaceholderUsername(username)) return false;
  if (displayName && !isPlaceholderUsername(displayName)) return false;
  return true;
}

/**
 * Copy leap denormalized identity onto `users/{uid}` when the profile row is missing it.
 * Sets `username` + claim when free; otherwise sets `displayName` so Top/leaperboard can show a name.
 */
export async function syncUserIdentityFromVideo(
  db: admin.firestore.Firestore,
  uid: string,
  videoData: Record<string, unknown>
): Promise<{ updated: boolean; fields: string[] }> {
  const owner = String(videoData.uid ?? '').trim();
  if (!owner || owner !== uid) {
    return { updated: false, fields: [] };
  }

  const videoUsername = usernameFromVideo(videoData);
  const videoPhoto = photoUrlFromVideo(videoData);
  if (!videoUsername && !videoPhoto) {
    return { updated: false, fields: [] };
  }

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    return { updated: false, fields: [] };
  }

  const user = userSnap.data() as Record<string, unknown>;
  if (!userNeedsIdentitySync(user)) {
    const patchOnlyPhoto: Record<string, unknown> = {};
    const currentPhoto = String(user.photoUrl ?? '').trim();
    if (!currentPhoto && videoPhoto) {
      patchOnlyPhoto.photoUrl = videoPhoto;
      await userRef.set(
        { ...patchOnlyPhoto, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      return { updated: true, fields: ['photoUrl'] };
    }
    return { updated: false, fields: [] };
  }

  const fields: string[] = [];
  const mergePatch: Record<string, unknown> = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const currentPhoto = String(user.photoUrl ?? '').trim();
  if (!currentPhoto && videoPhoto) {
    mergePatch.photoUrl = videoPhoto;
    fields.push('photoUrl');
  }

  if (videoUsername) {
    const key = usernameClaimDocId(videoUsername);
    const claimRef = db.doc(`usernameClaims/${key}`);
    const claimSnap = await claimRef.get();
    const claimOwner = claimSnap.exists ? String(claimSnap.data()?.uid ?? '').trim() : '';

    if (!claimSnap.exists || claimOwner === uid) {
      await db.runTransaction(async (tx) => {
        const uSnap = await tx.get(userRef);
        if (!uSnap.exists) return;
        const u = uSnap.data() as Record<string, unknown>;
        if (!userNeedsIdentitySync(u)) return;

        const cSnap = await tx.get(claimRef);
        const owner = cSnap.exists ? String(cSnap.data()?.uid ?? '').trim() : '';
        if (cSnap.exists && owner && owner !== uid) {
          tx.set(
            userRef,
            {
              displayName: videoUsername,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          return;
        }

        const prevLower =
          typeof u.usernameLower === 'string' ? String(u.usernameLower).trim() : '';
        if (prevLower && prevLower !== key) {
          const prevRef = db.doc(`usernameClaims/${prevLower}`);
          const prevSnap = await tx.get(prevRef);
          if (prevSnap.exists && String(prevSnap.data()?.uid ?? '') === uid) {
            tx.delete(prevRef);
          }
        }

        tx.set(claimRef, { uid });
        tx.set(
          userRef,
          {
            username: videoUsername,
            usernameLower: key,
            displayName: admin.firestore.FieldValue.delete(),
            ...(mergePatch.photoUrl ? { photoUrl: mergePatch.photoUrl } : {}),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      fields.push('username', 'usernameLower');
      return { updated: true, fields };
    }

    mergePatch.displayName = videoUsername;
    fields.push('displayName');
  }

  if (fields.length === 0) {
    return { updated: false, fields: [] };
  }

  await userRef.set(mergePatch, { merge: true });
  return { updated: true, fields };
}

/** Latest leap for `uid` with a non-placeholder username (for backfill). */
export async function latestVideoIdentityForUser(
  db: admin.firestore.Firestore,
  uid: string
): Promise<Record<string, unknown> | null> {
  try {
    const snap = await db
      .collection(POST_COLLECTION)
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(8)
      .get();
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      if (usernameFromVideo(data)) return data;
    }
  } catch (e) {
    logger.warn('latestVideoIdentity orderBy failed, falling back', { uid, e });
  }

  const broad = await db.collection(POST_COLLECTION).where('uid', '==', uid).limit(24).get();
  let best: { data: Record<string, unknown>; ms: number } | null = null;
  for (const d of broad.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.deleted === true) continue;
    if (!usernameFromVideo(data)) continue;
    const ms =
      typeof (data.createdAt as admin.firestore.Timestamp)?.toMillis === 'function'
        ? (data.createdAt as admin.firestore.Timestamp).toMillis()
        : 0;
    if (!best || ms > best.ms) best = { data, ms };
  }
  return best?.data ?? null;
}

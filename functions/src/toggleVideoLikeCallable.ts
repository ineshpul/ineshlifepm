import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { CALLABLE_OPTIONS } from './callableOptions';
import { COUNT_SYNCED_FIELD } from './likeEngagement';

const POST_COLLECTION = 'videos';

type ToggleResult = {
  liked: boolean;
  likesCount: number;
  ownerUid: string;
};

/**
 * Atomically toggles (or sets) a like and updates `videos/{id}.likesCount` in one transaction
 * so the client does not wait on a separate trigger round-trip.
 */
export const toggleVideoLikeCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const viewerUid = request.auth?.uid;
  if (!viewerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const videoId = String(request.data?.videoId ?? '').trim();
  if (!videoId) throw new HttpsError('invalid-argument', 'videoId is required.');

  const viewerUsername = String(request.data?.viewerUsername ?? '').trim() || 'user';
  const desired = request.data?.liked;
  const desiredLiked = desired === true ? true : desired === false ? false : null;

  const db = admin.firestore();
  const videoRef = db.doc(`${POST_COLLECTION}/${videoId}`);
  const likeRef = videoRef.collection('likes').doc(viewerUid);

  const result = await db.runTransaction(async (tx): Promise<ToggleResult> => {
    const [videoSnap, likeSnap] = await Promise.all([tx.get(videoRef), tx.get(likeRef)]);
    if (!videoSnap.exists) throw new HttpsError('not-found', 'Video not found.');

    const ownerUid = String(videoSnap.data()?.uid ?? '');
    const currentCount = Math.max(0, Number(videoSnap.data()?.likesCount ?? 0));
    const isLiked = likeSnap.exists;

    if (desiredLiked === true && isLiked) {
      return { liked: true, likesCount: currentCount, ownerUid };
    }
    if (desiredLiked === false && !isLiked) {
      return { liked: false, likesCount: currentCount, ownerUid };
    }
    if (desiredLiked === null && isLiked) {
      tx.delete(likeRef);
      const next = Math.max(0, currentCount - 1);
      tx.set(videoRef, { likesCount: next }, { merge: true });
      return { liked: false, likesCount: next, ownerUid };
    }
    if (desiredLiked === false) {
      tx.delete(likeRef);
      const next = Math.max(0, currentCount - 1);
      tx.set(videoRef, { likesCount: next }, { merge: true });
      return { liked: false, likesCount: next, ownerUid };
    }

    // Like (toggle-on or ensure-on).
    if (!isLiked) {
      tx.set(likeRef, {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        [COUNT_SYNCED_FIELD]: true,
      });
      const next = currentCount + 1;
      tx.set(videoRef, { likesCount: next }, { merge: true });
      return { liked: true, likesCount: next, ownerUid };
    }

    return { liked: true, likesCount: currentCount, ownerUid };
  });

  if (result.liked && result.ownerUid && result.ownerUid !== viewerUid) {
    try {
      await db.collection(`users/${result.ownerUid}/notifications`).add({
        type: 'like',
        fromUid: viewerUid,
        fromUsername: viewerUsername,
        videoId,
        snippet: null,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {
      // best-effort — like already persisted
    }
  }

  return { ok: true, liked: result.liked, likesCount: result.likesCount };
});

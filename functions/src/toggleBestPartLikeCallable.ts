import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { CALLABLE_OPTIONS } from './callableOptions';
import { COUNT_SYNCED_FIELD } from './likeEngagement';

const POST_COLLECTION = 'bestParts';

type ToggleResult = {
  liked: boolean;
  likesCount: number;
  ownerUid: string;
};

/**
 * Atomically toggles a like on `bestParts/{id}` and updates `likesCount`.
 * No leap scoring side effects.
 */
export const toggleBestPartLikeCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const viewerUid = request.auth?.uid;
  if (!viewerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const bestPartId = String(request.data?.bestPartId ?? '').trim();
  if (!bestPartId) throw new HttpsError('invalid-argument', 'bestPartId is required.');

  const viewerUsername = String(request.data?.viewerUsername ?? '').trim() || 'user';
  const desired = request.data?.liked;
  const desiredLiked = desired === true ? true : desired === false ? false : null;

  const db = admin.firestore();
  const postRef = db.doc(`${POST_COLLECTION}/${bestPartId}`);
  const likeRef = postRef.collection('likes').doc(viewerUid);

  const result = await db.runTransaction(async (tx): Promise<ToggleResult> => {
    const [postSnap, likeSnap] = await Promise.all([tx.get(postRef), tx.get(likeRef)]);
    if (!postSnap.exists) throw new HttpsError('not-found', 'Moment not found.');

    const data = postSnap.data() ?? {};
    if (data.deleted === true) throw new HttpsError('failed-precondition', 'Moment was removed.');
    if (data.isPrivate === true && String(data.uid ?? '') !== viewerUid) {
      throw new HttpsError('permission-denied', 'This moment is private.');
    }

    const ownerUid = String(data.uid ?? '');
    const currentCount = Math.max(0, Number(data.likesCount ?? 0));
    const isLiked = likeSnap.exists;

    if (desiredLiked === true && isLiked) {
      return { liked: true, likesCount: currentCount, ownerUid };
    }
    if (desiredLiked === false && !isLiked) {
      return { liked: false, likesCount: currentCount, ownerUid };
    }
    if ((desiredLiked === null && isLiked) || desiredLiked === false) {
      tx.delete(likeRef);
      const next = Math.max(0, currentCount - 1);
      tx.set(postRef, { likesCount: next }, { merge: true });
      return { liked: false, likesCount: next, ownerUid };
    }

    if (!isLiked) {
      tx.set(likeRef, {
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        [COUNT_SYNCED_FIELD]: true,
      });
      const next = currentCount + 1;
      tx.set(postRef, { likesCount: next }, { merge: true });
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
        bestPartId,
        videoId: null,
        snippet: null,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch {
      // best-effort
    }
  }

  return { ok: true, liked: result.liked, likesCount: result.likesCount };
});

import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';

const REGION = 'us-central1';
const POST_COLLECTION = 'videos';

async function bumpLikesCount(videoId: string, delta: number): Promise<void> {
  if (!delta) return;
  try {
    await admin.firestore().doc(`${POST_COLLECTION}/${videoId}`).update({
      likesCount: admin.firestore.FieldValue.increment(delta),
    });
  } catch (e) {
    logger.warn('likesCount sync failed', { videoId, delta, e });
  }
}

/** Fast path: increment denormalized count on like create (no heavy recompute). */
export const onVideoLikeCreated = onDocumentCreated(
  { document: `${POST_COLLECTION}/{videoId}/likes/{likerId}`, region: REGION },
  async (event) => {
    const videoId = event.params.videoId as string;
    if (!videoId) return;
    await bumpLikesCount(videoId, 1);
  }
);

/** Fast path: decrement denormalized count on unlike. */
export const onVideoLikeDeleted = onDocumentDeleted(
  { document: `${POST_COLLECTION}/{videoId}/likes/{likerId}`, region: REGION },
  async (event) => {
    const videoId = event.params.videoId as string;
    if (!videoId) return;
    await bumpLikesCount(videoId, -1);
  }
);

/** Admin callable helper: count likes subcollection and write `likesCount` on the video doc. */
export async function syncLikesCountForVideo(
  db: admin.firestore.Firestore,
  videoId: string
): Promise<number> {
  const videoRef = db.doc(`${POST_COLLECTION}/${videoId}`);
  const videoSnap = await videoRef.get();
  if (!videoSnap.exists) return 0;
  const agg = await videoRef.collection('likes').count().get();
  const count = Math.max(0, agg.data().count);
  await videoRef.update({ likesCount: count });
  return count;
}

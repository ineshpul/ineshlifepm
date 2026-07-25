import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';

import { COUNT_SYNCED_FIELD } from './likeEngagement';

const REGION = 'us-central1';
const POST_COLLECTION = 'bestParts';

async function bumpLikesCount(bestPartId: string, delta: number): Promise<void> {
  if (!delta) return;
  try {
    await admin
      .firestore()
      .doc(`${POST_COLLECTION}/${bestPartId}`)
      .set({ likesCount: admin.firestore.FieldValue.increment(delta) }, { merge: true });
  } catch (e) {
    logger.warn('bestParts likesCount sync failed', { bestPartId, delta, e });
  }
}

export const onBestPartLikeCreated = onDocumentCreated(
  { document: `${POST_COLLECTION}/{bestPartId}/likes/{likerId}`, region: REGION },
  async (event) => {
    const bestPartId = event.params.bestPartId as string;
    if (!bestPartId) return;
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (data?.[COUNT_SYNCED_FIELD] === true) return;
    await bumpLikesCount(bestPartId, 1);
  }
);

export const onBestPartLikeDeleted = onDocumentDeleted(
  { document: `${POST_COLLECTION}/{bestPartId}/likes/{likerId}`, region: REGION },
  async (event) => {
    const bestPartId = event.params.bestPartId as string;
    if (!bestPartId) return;
    await bumpLikesCount(bestPartId, -1);
  }
);

/** Keep `commentsCount` in sync — no leap vertical-score side effects. */
export const onBestPartCommentWrite = onDocumentWritten(
  { document: `${POST_COLLECTION}/{bestPartId}/comments/{commentId}`, region: REGION },
  async (event) => {
    const bestPartId = event.params.bestPartId as string;
    if (!bestPartId) return;
    const before = event.data?.before.exists === true;
    const after = event.data?.after.exists === true;
    let delta = 0;
    if (!before && after) delta = 1;
    else if (before && !after) delta = -1;
    if (!delta) return;
    try {
      await admin
        .firestore()
        .doc(`${POST_COLLECTION}/${bestPartId}`)
        .set({ commentsCount: admin.firestore.FieldValue.increment(delta) }, { merge: true });
    } catch (e) {
      logger.warn('bestParts commentsCount sync failed', { bestPartId, delta, e });
    }
  }
);

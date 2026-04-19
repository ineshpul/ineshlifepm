import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentDeleted, onDocumentWritten } from 'firebase-functions/v2/firestore';

import { computeVerticalScoreFromPosts } from './verticalScoreEngine';
import type { PostMetricsSnapshot } from './verticalScoreTypes';

const REGION = 'us-central1';
const POST_COLLECTION = 'videos';
const SCORE_WRITE_BATCH = 80;

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function windowStartMs(nowMs: number): number {
  return nowMs - 14 * 86400000;
}

async function buildSnapshotsForOwner(ownerId: string, db: admin.firestore.Firestore): Promise<PostMetricsSnapshot[]> {
  const q = db
    .collection(POST_COLLECTION)
    .where('uid', '==', ownerId)
    .orderBy('createdAt', 'desc')
    .limit(SCORE_WRITE_BATCH);

  const snap = await q.get();
  const now = Date.now();
  const start = windowStartMs(now);
  const out: PostMetricsSnapshot[] = [];

  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (String(data.moderationStatus ?? '') === 'rejected') continue;

    const createdAtMs = toMillis(data.createdAt);
    const effectiveCreated = createdAtMs > 0 ? createdAtMs : now;
    if (effectiveCreated < start) continue;

    const likesAgg = await d.ref.collection('likes').count().get();
    const commentsAgg = await d.ref.collection('comments').count().get();

    const likes = likesAgg.data().count;
    const comments = commentsAgg.data().count;

    const views = Number(data.viewCount ?? data.views ?? 0);
    const shares = Number(data.shareCount ?? data.shares ?? 0);
    const saves = Number(data.saveCount ?? data.saves ?? 0);
    const reports = Number(data.reportCount ?? data.reports ?? 0);
    const deleted = Boolean(data.deleted ?? false);
    const challengeCompleted = data.challengeCompleted !== false;

    out.push({
      postId: d.id,
      ownerId,
      createdAtMs: effectiveCreated,
      views,
      likes,
      comments,
      shares,
      saves,
      reports,
      deleted,
      challengeCompleted,
    });
  }

  return out;
}

export async function recomputeVerticalScoreAdmin(ownerId: string): Promise<void> {
  if (!ownerId) return;
  const db = admin.firestore();
  const posts = await buildSnapshotsForOwner(ownerId, db);
  const { verticalScore, breakdown } = computeVerticalScoreFromPosts(posts, Date.now());

  await db.doc(`users/${ownerId}`).set(
    {
      verticalScore,
      verticalScoreBreakdown: breakdown,
      verticalScoreUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function ownerUidFromVideoId(videoId: string): Promise<string | null> {
  const snap = await admin.firestore().doc(`${POST_COLLECTION}/${videoId}`).get();
  if (!snap.exists) return null;
  const uid = String(snap.data()?.uid ?? '');
  return uid || null;
}

export const onVerticalScoreVideoCreated = onDocumentCreated(
  { document: `${POST_COLLECTION}/{videoId}`, region: REGION },
  async (event) => {
    const uid = String(event.data?.data()?.uid ?? '');
    if (!uid) return;
    try {
      await recomputeVerticalScoreAdmin(uid);
    } catch (e) {
      logger.error('verticalScore recompute failed (video create)', { uid, e });
    }
  }
);

export const onVerticalScoreVideoDeleted = onDocumentDeleted(
  { document: `${POST_COLLECTION}/{videoId}`, region: REGION },
  async (event) => {
    const uid = String(event.data?.data()?.uid ?? '');
    if (!uid) return;
    try {
      await recomputeVerticalScoreAdmin(uid);
    } catch (e) {
      logger.error('verticalScore recompute failed (video delete)', { uid, e });
    }
  }
);

export const onVerticalScoreLikeWrite = onDocumentWritten(
  { document: `${POST_COLLECTION}/{videoId}/likes/{likerId}`, region: REGION },
  async (event) => {
    const videoId = event.params.videoId as string;
    const owner = await ownerUidFromVideoId(videoId);
    if (!owner) return;
    try {
      await recomputeVerticalScoreAdmin(owner);
    } catch (e) {
      logger.error('verticalScore recompute failed (like)', { videoId, e });
    }
  }
);

export const onVerticalScoreCommentWrite = onDocumentWritten(
  { document: `${POST_COLLECTION}/{videoId}/comments/{commentId}`, region: REGION },
  async (event) => {
    const videoId = event.params.videoId as string;
    const owner = await ownerUidFromVideoId(videoId);
    if (!owner) return;
    try {
      await recomputeVerticalScoreAdmin(owner);
    } catch (e) {
      logger.error('verticalScore recompute failed (comment)', { videoId, e });
    }
  }
);

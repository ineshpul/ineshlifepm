/**
 * Best Part of the Day inches — flat +5 base + leap engagement rates.
 * Credits the same user aggregates as leaps (lifetime / day / week).
 * Does NOT affect streak, first-ever, or global-first bonuses.
 */
import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
} from 'firebase-functions/v2/firestore';

import { incrementUserLeapInches } from './leaperPoints';
import { leapChallengeDateKeyFromMs } from './timeKeys';
import { LEAP_BASE_INCHES } from './verticalScoreEngine';
import { writeUserWeeklyLeaperFields } from './weeklyLeaperFields';

const REGION = 'us-central1';
const POST_COLLECTION = 'bestParts';

/** Same nominal base as a normal leap — no streak / first-post multipliers. */
export const BEST_PART_BASE_INCHES = LEAP_BASE_INCHES;

export type BestPartInchesBreakdown = {
  baseInches: number;
  engagementInches: number;
  leapInches: number;
};

export function computeBestPartInches(input: {
  likes: number;
  comments: number;
  shares: number;
  views: number;
}): BestPartInchesBreakdown {
  const baseInches = BEST_PART_BASE_INCHES;
  const engagementInches =
    Math.max(0, input.likes) * 1 +
    Math.max(0, input.comments) * 2 +
    Math.max(0, input.shares) * 3 +
    Math.max(0, input.views) * 0.5;
  const leapInches = Math.round((baseInches + engagementInches) * 10) / 10;
  return {
    baseInches,
    engagementInches,
    leapInches: Math.max(0, leapInches),
  };
}

function inchesFromDoc(data: Record<string, unknown> | undefined): number {
  if (!data) return 0;
  const n = Number(data.leapInches ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
}

function isAwardedBestPart(data: Record<string, unknown> | undefined): boolean {
  return data?.leapInchesAwarded === true;
}

function bestPartCountsTowardTotals(data: Record<string, unknown>): boolean {
  if (data.deleted === true) return false;
  return isAwardedBestPart(data);
}

function toMillis(raw: unknown): number {
  if (!raw) return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof (raw as { toMillis?: () => number }).toMillis === 'function') {
    return (raw as { toMillis: () => number }).toMillis();
  }
  return 0;
}

async function countUniqueNonOwnerCommenters(
  postRef: admin.firestore.DocumentReference,
  ownerId: string
): Promise<number> {
  const snap = await postRef.collection('comments').get();
  const uids = new Set<string>();
  for (const d of snap.docs) {
    const uid = String(d.data()?.uid ?? '').trim();
    if (uid && uid !== ownerId) uids.add(uid);
  }
  return uids.size;
}

async function countNonOwnerLikes(
  postRef: admin.firestore.DocumentReference,
  ownerId: string
): Promise<number> {
  const likesCol = postRef.collection('likes');
  const [likesTotalAgg, selfLikeSnap] = await Promise.all([
    likesCol.count().get(),
    likesCol.doc(ownerId).get(),
  ]);
  let likes = likesTotalAgg.data().count;
  if (selfLikeSnap.exists) likes = Math.max(0, likes - 1);
  return likes;
}

async function countNonOwnerViews(
  postRef: admin.firestore.DocumentReference,
  ownerId: string
): Promise<number> {
  const snap = await postRef.collection('viewMarks').get().catch(() => null);
  if (!snap) return 0;
  let n = 0;
  for (const d of snap.docs) {
    if (d.id !== ownerId) n += 1;
  }
  return n;
}

async function loadEngagementForBestPart(
  postRef: admin.firestore.DocumentReference,
  ownerId: string,
  data: Record<string, unknown>
): Promise<{ likes: number; comments: number; shares: number; views: number }> {
  const [likes, comments, views] = await Promise.all([
    countNonOwnerLikes(postRef, ownerId),
    countUniqueNonOwnerCommenters(postRef, ownerId),
    countNonOwnerViews(postRef, ownerId),
  ]);
  return {
    likes,
    comments,
    shares: Math.max(0, Number(data.shareCount ?? data.shares ?? 0)),
    views,
  };
}

async function awardBestPartInches(
  db: admin.firestore.Firestore,
  postRef: admin.firestore.DocumentReference,
  postId: string,
  data: Record<string, unknown>
): Promise<void> {
  const owner = String(data.uid ?? '').trim();
  if (!owner) return;
  if (data.deleted === true) return;
  if (isAwardedBestPart(data)) return;

  const eng = await loadEngagementForBestPart(postRef, owner, data);
  const computed = computeBestPartInches(eng);
  const dateKey =
    String(data.dateKey ?? '').trim() || leapChallengeDateKeyFromMs(Date.now());
  const nowMs = Date.now();

  const awarded = await db.runTransaction(async (tx) => {
    const snap = await tx.get(postRef);
    if (!snap.exists) return false;
    const vd = snap.data() as Record<string, unknown>;
    if (vd.deleted === true || isAwardedBestPart(vd)) return false;

    tx.set(
      postRef,
      {
        leapInches: computed.leapInches,
        leapBaseInches: computed.baseInches,
        leapEngagementInches: computed.engagementInches,
        leapInchesAwarded: true,
        leapInchesAwardedAt: admin.firestore.FieldValue.serverTimestamp(),
        leapWasBestPart: true,
      },
      { merge: true }
    );
    return true;
  });

  if (!awarded) return;

  await incrementUserLeapInches(
    db,
    owner,
    computed.leapInches,
    dateKey,
    nowMs,
    nowMs,
    'awardBestPartInches'
  );

  try {
    await writeUserWeeklyLeaperFields(db, owner, nowMs);
  } catch (e) {
    logger.warn('weekly sync after best-part award failed', { owner, postId, e });
  }
}

export async function adminRetotalAwardedBestPartInches(
  db: admin.firestore.Firestore,
  postId: string
): Promise<{ delta: number }> {
  const postRef = db.doc(`${POST_COLLECTION}/${postId}`);
  const snap = await postRef.get();
  if (!snap.exists) return { delta: 0 };
  const data = snap.data() as Record<string, unknown>;
  if (!bestPartCountsTowardTotals(data)) return { delta: 0 };

  const owner = String(data.uid ?? '').trim();
  if (!owner) return { delta: 0 };

  const eng = await loadEngagementForBestPart(postRef, owner, data);
  const br = computeBestPartInches(eng);
  const oldInches = inchesFromDoc(data);
  const delta = Math.round((br.leapInches - oldInches) * 10) / 10;

  await postRef.set(
    {
      leapInches: br.leapInches,
      leapBaseInches: br.baseInches,
      leapEngagementInches: br.engagementInches,
    },
    { merge: true }
  );

  if (delta === 0) return { delta: 0 };

  const awardMs = toMillis(data.leapInchesAwardedAt ?? data.createdAt);
  const nowMs = Date.now();
  const dateKey =
    String(data.dateKey ?? '').trim() ||
    leapChallengeDateKeyFromMs(awardMs > 0 ? awardMs : nowMs);

  await incrementUserLeapInches(
    db,
    owner,
    delta,
    dateKey,
    awardMs > 0 ? awardMs : nowMs,
    nowMs,
    'retotalBestPartInches'
  );

  try {
    await writeUserWeeklyLeaperFields(db, owner, nowMs);
  } catch {
    /* noop — increment already applied */
  }
  return { delta };
}

async function revokeBestPartInches(
  db: admin.firestore.Firestore,
  postId: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!isAwardedBestPart(data)) return;
  const owner = String(data.uid ?? '').trim();
  if (!owner) return;
  const inches = inchesFromDoc(data);
  const dateKey =
    String(data.dateKey ?? '').trim() || leapChallengeDateKeyFromMs(Date.now());
  const nowMs = Date.now();
  const awardMs = toMillis(data.leapInchesAwardedAt ?? data.createdAt);

  const postRef = db.doc(`${POST_COLLECTION}/${postId}`);
  await postRef.set(
    {
      leapInchesAwarded: false,
      leapInches: 0,
      leapEngagementInches: 0,
    },
    { merge: true }
  );

  if (inches > 0) {
    await incrementUserLeapInches(
      db,
      owner,
      -inches,
      dateKey,
      awardMs > 0 ? awardMs : nowMs,
      nowMs,
      'revokeBestPartInches'
    );
  }

  try {
    await writeUserWeeklyLeaperFields(db, owner, nowMs);
  } catch (e) {
    logger.warn('weekly sync after best-part revoke failed', { owner, postId, e });
  }
}

const ENGAGEMENT_RETOTAL_COOLDOWN_MS = 5 * 60 * 1000;

export async function maybeRefreshBestPartInchesAfterEngagement(
  postId: string
): Promise<void> {
  const db = admin.firestore();
  const ref = db.doc(`${POST_COLLECTION}/${postId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as Record<string, unknown>;
  if (data.deleted === true) return;

  // Older Best Parts posted before scoring: award on first engagement touch.
  if (!isAwardedBestPart(data)) {
    try {
      await awardBestPartInches(db, ref, postId, data);
    } catch (e) {
      logger.warn('best-part late award failed', { postId, e });
    }
    return;
  }

  const lastMs = toMillis(data.leapEngagementRetotalAt);
  if (lastMs && Date.now() - lastMs < ENGAGEMENT_RETOTAL_COOLDOWN_MS) return;

  try {
    await ref.set(
      { leapEngagementRetotalAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    await adminRetotalAwardedBestPartInches(db, postId);
  } catch (e) {
    logger.error('best-part inches engagement refresh failed', { postId, e });
  }
}

/** Sum awarded Best Part inches for recompute (lifetime / day filters). */
export async function sumBestPartInchesForOwner(
  db: admin.firestore.Firestore,
  ownerId: string,
  filter?: (data: Record<string, unknown>) => boolean
): Promise<number> {
  let total = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;
  const PAGE = 500;
  for (;;) {
    let q = db
      .collection(POST_COLLECTION)
      .where('uid', '==', ownerId)
      .orderBy('createdAt', 'desc')
      .limit(PAGE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (!bestPartCountsTowardTotals(data)) continue;
      if (filter && !filter(data)) continue;
      total += inchesFromDoc(data);
    }
    if (snap.size < PAGE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return Math.round(total * 10) / 10;
}

export async function sumBestPartInchesForOwnerWeek(
  db: admin.firestore.Firestore,
  ownerId: string,
  weekKey: string,
  belongsToWeek: (dateKey: string, weekKey: string) => boolean
): Promise<number> {
  return sumBestPartInchesForOwner(db, ownerId, (data) => {
    const k = String(data.dateKey ?? '').trim();
    return Boolean(k && belongsToWeek(k, weekKey));
  });
}

export const onBestPartScoreCreated = onDocumentCreated(
  { document: `${POST_COLLECTION}/{bestPartId}`, region: REGION },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const postId = String(event.params.bestPartId ?? '');
    if (!data || !postId) return;
    if (data.deleted === true) return;
    const db = admin.firestore();
    const postRef = db.doc(`${POST_COLLECTION}/${postId}`);
    try {
      await awardBestPartInches(db, postRef, postId, data);
    } catch (e) {
      logger.warn('best-part inches award failed', { postId, e });
    }
  }
);

export const onBestPartScoreWritten = onDocumentWritten(
  { document: `${POST_COLLECTION}/{bestPartId}`, region: REGION },
  async (event) => {
    const postId = String(event.params.bestPartId ?? '');
    if (!postId) return;
    const before = event.data?.before;
    const after = event.data?.after;
    const db = admin.firestore();

    // Soft-delete → revoke once.
    if (after?.exists) {
      const afterData = after.data() as Record<string, unknown>;
      const beforeData = before?.exists
        ? (before.data() as Record<string, unknown>)
        : undefined;
      if (
        afterData.deleted === true &&
        beforeData &&
        beforeData.deleted !== true &&
        isAwardedBestPart(beforeData)
      ) {
        try {
          await revokeBestPartInches(db, postId, beforeData);
        } catch (e) {
          logger.warn('best-part inches revoke failed', { postId, e });
        }
        return;
      }

      // Undelete after soft-delete revoke — re-award base + engagement.
      if (
        afterData.deleted !== true &&
        beforeData &&
        beforeData.deleted === true &&
        !isAwardedBestPart(afterData)
      ) {
        try {
          await awardBestPartInches(
            db,
            db.doc(`${POST_COLLECTION}/${postId}`),
            postId,
            afterData
          );
        } catch (e) {
          logger.warn('best-part inches re-award after undelete failed', { postId, e });
        }
      }
      return;
    }

    // Hard delete
    if (before?.exists) {
      const beforeData = before.data() as Record<string, unknown>;
      if (isAwardedBestPart(beforeData)) {
        try {
          await revokeBestPartInches(db, postId, beforeData);
        } catch (e) {
          logger.warn('best-part inches revoke on hard delete failed', { postId, e });
        }
      }
    }
  }
);

// Re-export engagement hooks used from bestPartEngagement — keep triggers here for delete.
export const onBestPartScoreDeleted = onDocumentDeleted(
  { document: `${POST_COLLECTION}/{bestPartId}`, region: REGION },
  async (event) => {
    const postId = String(event.params.bestPartId ?? '');
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!postId || !data) return;
    if (!isAwardedBestPart(data)) return;
    try {
      await revokeBestPartInches(admin.firestore(), postId, data);
    } catch (e) {
      logger.warn('best-part inches revoke on delete failed', { postId, e });
    }
  }
);

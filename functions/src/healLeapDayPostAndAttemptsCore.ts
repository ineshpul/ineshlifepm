import * as admin from 'firebase-admin';

import {
  defaultLeapChallengeDateForReset,
  runResetRecordingAttemptsForLeapDayPage,
} from './resetRecordingAttemptsForLeapDayCore';

export type HealLeapDayResult = {
  challengeDate: string;
  dryRun: boolean;
  softDeletedVideosRemoved: number;
  ghostVideosRemoved: number;
  postAttemptsReset: number;
  postAttemptsSkippedPosted: number;
  postAttemptsSkippedFresh: number;
  postAttemptsFailed: number;
  /** Live posts still on this leap day (not removed by heal). */
  activeVideosRemaining: number;
};

/** Active leap day from Firestore config (matches security rules / feed). */
export async function leapViewingChallengeDateKey(db: admin.firestore.Firestore): Promise<string> {
  const snap = await db.doc('config/leapViewing').get();
  const key = String(snap.data()?.viewingChallengeDateKey ?? '').trim();
  return key || defaultLeapChallengeDateForReset(Date.now());
}

/**
 * Video doc still present but ledger never marked "posted" (used < max) — typical after a
 * failed delete / "You already posted today" while attempts remain.
 */
export async function removeGhostVideosWithOpenLedger(
  db: admin.firestore.Firestore,
  args: { challengeDate: string; dryRun: boolean; pageSize?: number }
): Promise<number> {
  const { challengeDate, dryRun } = args;
  const pageSize = Math.min(Math.max(args.pageSize ?? 200, 1), 400);
  let removed = 0;
  let cursor = '';

  for (;;) {
    let q: admin.firestore.Query = db
      .collection('postAttempts')
      .where('challengeDate', '==', challengeDate)
      .limit(pageSize);
    if (cursor) {
      const c = await db.doc(`postAttempts/${cursor}`).get();
      if (c.exists) q = q.startAfter(c);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const attempt of snap.docs) {
      const data = attempt.data();
      const used = Number(data.used ?? 0);
      const max = Number(data.max ?? 3);
      if (used >= max) continue;

      const videoSnap = await db.doc(`videos/${attempt.id}`).get();
      if (!videoSnap.exists) continue;

      const vd = videoSnap.data() as { deleted?: boolean; moderationStatus?: string };
      const status = String(vd.moderationStatus ?? '');
      if (vd.deleted === true || status === 'rejected' || status === 'nulled') continue;

      if (!dryRun) {
        const likes = await videoSnap.ref.collection('likes').limit(500).get();
        const comments = await videoSnap.ref.collection('comments').limit(500).get();
        const batch = db.batch();
        for (const d of likes.docs) batch.delete(d.ref);
        for (const d of comments.docs) batch.delete(d.ref);
        batch.delete(videoSnap.ref);
        await batch.commit();
      }
      removed += 1;
    }

    if (snap.size < pageSize) break;
    cursor = snap.docs[snap.docs.length - 1].id;
  }

  return removed;
}

/** Hard-delete soft-deleted / rejected video docs for a leap day. */
export async function removeSoftDeletedVideosForLeapDay(
  db: admin.firestore.Firestore,
  args: { challengeDate: string; dryRun: boolean }
): Promise<number> {
  const { challengeDate, dryRun } = args;
  let removed = 0;

  const snap = await db.collection('videos').where('challengeDate', '==', challengeDate).get();

  for (const doc of snap.docs) {
    const data = doc.data() as { deleted?: boolean; moderationStatus?: string };
    const status = String(data.moderationStatus ?? '');
    const shouldRemove =
      data.deleted === true || status === 'rejected' || status === 'nulled';
    if (!shouldRemove) continue;

    if (!dryRun) {
      const likes = await doc.ref.collection('likes').limit(500).get();
      const comments = await doc.ref.collection('comments').limit(500).get();
      const batch = db.batch();
      for (const d of likes.docs) batch.delete(d.ref);
      for (const d of comments.docs) batch.delete(d.ref);
      batch.delete(doc.ref);
      await batch.commit();
    }
    removed += 1;
  }

  return removed;
}

/** Soft-deleted video cleanup + reset attempt ledgers for users without an active post. */
export async function healLeapDayPostAndAttempts(
  db: admin.firestore.Firestore,
  args: { challengeDate?: string; dryRun: boolean; pageSize?: number }
): Promise<HealLeapDayResult> {
  const dryRun = args.dryRun;
  const challengeDate =
    String(args.challengeDate ?? '').trim() || (await leapViewingChallengeDateKey(db));
  const pageSize = Math.min(Math.max(args.pageSize ?? 200, 1), 400);

  const softDeletedVideosRemoved = await removeSoftDeletedVideosForLeapDay(db, {
    challengeDate,
    dryRun,
  });

  const ghostVideosRemoved = await removeGhostVideosWithOpenLedger(db, {
    challengeDate,
    dryRun,
    pageSize,
  });

  let cursor = '';
  let postAttemptsReset = 0;
  let postAttemptsSkippedPosted = 0;
  let postAttemptsSkippedFresh = 0;
  let postAttemptsFailed = 0;

  for (;;) {
    const r = await runResetRecordingAttemptsForLeapDayPage(db, {
      challengeDate,
      dryRun,
      pageSize,
      cursorAttemptId: cursor || undefined,
    });
    postAttemptsReset += r.reset;
    postAttemptsSkippedPosted += r.skippedPosted;
    postAttemptsSkippedFresh += r.skippedAlreadyFresh;
    postAttemptsFailed += r.failed;
    if (r.done) break;
    if (!r.nextCursorId) break;
    cursor = r.nextCursorId;
  }

  const remainingVideos = await db
    .collection('videos')
    .where('challengeDate', '==', challengeDate)
    .get();
  const activeVideosRemaining = remainingVideos.docs.filter((d) => {
    const data = d.data() as { deleted?: boolean; moderationStatus?: string };
    const status = String(data.moderationStatus ?? '');
    return data.deleted !== true && status !== 'rejected' && status !== 'nulled';
  }).length;

  return {
    challengeDate,
    dryRun,
    softDeletedVideosRemoved,
    ghostVideosRemoved,
    postAttemptsReset,
    postAttemptsSkippedPosted,
    postAttemptsSkippedFresh,
    postAttemptsFailed,
    activeVideosRemaining,
  };
}

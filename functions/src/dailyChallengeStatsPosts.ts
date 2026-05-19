import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

import { getDayKey, leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

/** Bump global approved-post counter when a video becomes approved (idempotent per video id). */
export async function incrementApprovedPostCountForLeap(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const nowMs = Date.now();
  const videoChallengeDate = String(video.challengeDate ?? '').trim();
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, nowMs);
  const leapDayKeyNow = getDayKey('America/New_York', nowMs);
  const ref = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const countedIds = (data.countedApprovedVideoIds ?? {}) as Record<string, boolean>;
    if (countedIds[videoId]) return;

    tx.set(
      ref,
      {
        challengeDate: dayStatsKey,
        approvedPostCount: admin.firestore.FieldValue.increment(1),
        [`countedApprovedVideoIds.${videoId}`]: true,
        lastApprovedPostAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  logger.info('dailyChallengeStats approvedPostCount increment', {
    dayStatsDocPath: `${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`,
    dayStatsKey,
    videoChallengeDate,
    leapDayKeyNow,
    dayKeysMatch: dayStatsKey === leapDayKeyNow,
    videoId,
  });
}

export async function decrementApprovedPostCountForLeap(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const nowMs = Date.now();
  const videoChallengeDate = String(video.challengeDate ?? '').trim();
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, nowMs);
  const ref = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const countedIds = (data.countedApprovedVideoIds ?? {}) as Record<string, boolean>;
    if (!countedIds[videoId]) return;

    tx.set(
      ref,
      {
        approvedPostCount: admin.firestore.FieldValue.increment(-1),
        [`countedApprovedVideoIds.${videoId}`]: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
  });
}

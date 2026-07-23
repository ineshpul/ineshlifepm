import * as logger from 'firebase-functions/logger';
import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { getDayKey, leapDayKeyFromStoredChallengeDate } from './leapDayKey';
import { challengeDateKeysForFirestoreIn, nyDateKeyFromMs } from './timeKeys';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

const POST_COLLECTION = 'videos';
const REGION = 'us-central1';

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/** Stats doc ids that may hold counts for a video's challenge day (leap + calendar when they differ). */
export function statsDocKeysForStoredChallengeDate(
  storedChallengeDate: string,
  fallbackMs: number = Date.now()
): string[] {
  const leapNorm = leapDayKeyFromStoredChallengeDate(storedChallengeDate, fallbackMs);
  const calNorm = nyDateKeyFromMs(fallbackMs);
  if (calNorm !== leapNorm) return [leapNorm, calNorm];
  return [leapNorm];
}

export async function countApprovedVideosForDay(
  db: admin.firestore.Firestore,
  dayKey: string
): Promise<number> {
  const inKeys = challengeDateKeysForFirestoreIn([dayKey]).slice(0, 30);
  if (!inKeys.length) return 0;

  const snap = await db
    .collection(POST_COLLECTION)
    .where('challengeDate', 'in', inKeys)
    .where('moderationStatus', '==', 'approved')
    .get();

  let n = 0;
  const targetNorm = leapDayKeyFromStoredChallengeDate(dayKey);
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (data.deleted === true) continue;
    const cd = leapDayKeyFromStoredChallengeDate(
      String(data.challengeDate ?? ''),
      toMillis(data.createdAt) || Date.now()
    );
    if (cd !== targetNorm) continue;
    n += 1;
  }
  return n;
}

/** Rebuild `approvedPostCount` + `countedApprovedVideoIds` from live approved videos (source of truth). */
export async function reconcileApprovedPostCountForLeapDay(
  db: admin.firestore.Firestore,
  dayKey: string
): Promise<number> {
  const targetNorm = leapDayKeyFromStoredChallengeDate(dayKey);
  const statsRef = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${targetNorm}`);
  const inKeys = challengeDateKeysForFirestoreIn([dayKey]).slice(0, 30);

  const countedApprovedVideoIds: Record<string, boolean> = {};
  if (inKeys.length) {
    const snap = await db
      .collection(POST_COLLECTION)
      .where('challengeDate', 'in', inKeys)
      .where('moderationStatus', '==', 'approved')
      .get();

    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) continue;
      const cd = leapDayKeyFromStoredChallengeDate(
        String(data.challengeDate ?? ''),
        toMillis(data.createdAt) || Date.now()
      );
      if (cd !== targetNorm) continue;
      countedApprovedVideoIds[d.id] = true;
    }
  }

  const count = Object.keys(countedApprovedVideoIds).length;

  await statsRef.set(
    {
      challengeDate: targetNorm,
      approvedPostCount: count,
      countedApprovedVideoIds,
      lastApprovedPostCountSyncAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info('dailyChallengeStats syncApprovedPostCountForLeapDay', {
    dayKey,
    targetNorm,
    count,
    statsPath: statsRef.path,
  });

  return count;
}

export async function syncApprovedPostCountForVideoChallenge(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>
): Promise<void> {
  const challengeDate = String(video.challengeDate ?? '').trim();
  const fallbackMs = toMillis(video.createdAt) || Date.now();
  const keys = statsDocKeysForStoredChallengeDate(challengeDate, fallbackMs);
  for (const k of keys) {
    await reconcileApprovedPostCountForLeapDay(db, k);
  }
}

/** Bump global approved-post counter when a video becomes approved (idempotent per video id). */
export async function incrementApprovedPostCountForLeap(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const fallbackMs = toMillis(video.createdAt) || Date.now();
  const videoChallengeDate = String(video.challengeDate ?? '').trim();
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, fallbackMs);
  const leapDayKeyNow = getDayKey('America/New_York');
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

/**
 * Bump "people posted today" on every active create (pending or approved).
 * Distinct from {@link incrementApprovedPostCountForLeap} so moderation lag does not zero the Today label.
 */
export async function incrementPostedPostCountForLeap(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const fallbackMs = toMillis(video.createdAt) || Date.now();
  const videoChallengeDate = String(video.challengeDate ?? '').trim();
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, fallbackMs);
  const ref = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const countedIds = (data.countedPostedVideoIds ?? {}) as Record<string, boolean>;
    if (countedIds[videoId]) return;

    tx.set(
      ref,
      {
        challengeDate: dayStatsKey,
        postedPostCount: admin.firestore.FieldValue.increment(1),
        [`countedPostedVideoIds.${videoId}`]: true,
        lastPostedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  logger.info('dailyChallengeStats postedPostCount increment', {
    dayStatsDocPath: `${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`,
    dayStatsKey,
    videoChallengeDate,
    videoId,
  });
}

export async function decrementPostedPostCountForLeap(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const fallbackMs = toMillis(video.createdAt) || Date.now();
  const videoChallengeDate = String(video.challengeDate ?? '').trim();
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, fallbackMs);
  const ref = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const countedIds = (data.countedPostedVideoIds ?? {}) as Record<string, boolean>;

    if (countedIds[videoId]) {
      tx.set(
        ref,
        {
          postedPostCount: admin.firestore.FieldValue.increment(-1),
          [`countedPostedVideoIds.${videoId}`]: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      return;
    }

    const current = Number(data.postedPostCount ?? 0);
    if (current > 0) {
      tx.set(
        ref,
        { postedPostCount: admin.firestore.FieldValue.increment(-1) },
        { merge: true }
      );
    }
  });
}

export async function decrementApprovedPostCountForLeap(
  db: admin.firestore.Firestore,
  video: Record<string, unknown>,
  videoId: string
): Promise<void> {
  const fallbackMs = toMillis(video.createdAt) || Date.now();
  const videoChallengeDate = String(video.challengeDate ?? '').trim();
  const dayStatsKey = leapDayKeyFromStoredChallengeDate(videoChallengeDate, fallbackMs);
  const ref = db.doc(`${DAILY_CHALLENGE_STATS_COLLECTION}/${dayStatsKey}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const countedIds = (data.countedApprovedVideoIds ?? {}) as Record<string, boolean>;

    if (countedIds[videoId]) {
      tx.set(
        ref,
        {
          approvedPostCount: admin.firestore.FieldValue.increment(-1),
          [`countedApprovedVideoIds.${videoId}`]: admin.firestore.FieldValue.delete(),
        },
        { merge: true }
      );
      return;
    }

    const current = Number(data.approvedPostCount ?? 0);
    if (current > 0) {
      tx.set(
        ref,
        { approvedPostCount: admin.firestore.FieldValue.increment(-1) },
        { merge: true }
      );
    }
  });
}

/** Signed-in clients may reconcile after delete; admins use backfill with dryRun. */
/** Callable name matches client `httpsCallable(..., 'syncApprovedPostCountForLeapDay')`. */
export const syncApprovedPostCountForLeapDay = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }

  const rawDay = String(request.data?.dayKey ?? '').trim();
  const dayKey = rawDay || getDayKey('America/New_York');
  const db = admin.firestore();
  const count = await reconcileApprovedPostCountForLeapDay(db, dayKey);
  return { dayKey, count };
});

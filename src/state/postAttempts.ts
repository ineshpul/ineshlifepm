import * as React from 'react';
import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  DEFAULT_MAX_RECORDING_ATTEMPTS,
  normalizeMaxRecordingAttempts,
} from './challenge';

async function maxAttemptsForChallengeDate(tx: Transaction, challengeDate: string) {
  const challengeRef = doc(firestore(), 'challenges', challengeDate);
  const challengeSnap = await tx.get(challengeRef);
  return normalizeMaxRecordingAttempts(challengeSnap.data()?.maxRecordingAttempts);
}

export type PostedVideoPayload = {
  uid: string;
  username: string;
  challengeDate: string;
  challengeTitle: string;
  challengeSubtitle: string;
  prompt: string;
  /** Matches the day’s task length (seconds). */
  maxDurationSeconds: number;
  source: string;
  url: string;
  storagePath: string;
  moderationStatus: 'pending' | 'approved' | 'rejected';
};

export async function commitPostedVideo(args: { payload: PostedVideoPayload }) {
  const { payload } = args;

  return await runTransaction(firestore(), async (tx) => {
    const videoRef = doc(firestore(), 'videos', `${payload.uid}_${payload.challengeDate}`);

    const videoSnap = await tx.get(videoRef);
    if (videoSnap.exists()) {
      throw new Error('You already posted today.');
    }

    tx.set(videoRef, {
      ...payload,
      createdAt: serverTimestamp(),
      viewCount: 0,
      likesCount: 0,
      commentsCount: 0,
      shareCount: 0,
      saveCount: 0,
      reportCount: 0,
      deleted: false,
      challengeCompleted: true,
    });

    return { videoId: videoRef.id };
  });
}

/** Vertical Score cost to buy one extra recording attempt (server-enforced). */
export const ATTEMPT_PURCHASE_VERTICAL_COST = 5;

export async function consumeRecordingAttempt(args: { uid: string; challengeDate: string }) {
  const { uid, challengeDate } = args;
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);

  return await runTransaction(firestore(), async (tx) => {
    const max = await maxAttemptsForChallengeDate(tx, challengeDate);
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    if (used >= max) {
      throw new Error('No attempts remaining today.');
    }

    tx.set(
      attemptRef,
      {
        uid,
        challengeDate,
        used: used + 1,
        max,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { usedAfter: used + 1 };
  });
}

/**
 * Call after a video doc exists for the day (post succeeded). Idempotent: sets `used` to max so
 * ledger matches “this day is spent” without throwing if a legacy client already incremented early.
 */
export async function syncAttemptLedgerAfterSuccessfulPost(args: { uid: string; challengeDate: string }) {
  const { uid, challengeDate } = args;
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);
  await runTransaction(firestore(), async (tx) => {
    const max = await maxAttemptsForChallengeDate(tx, challengeDate);
    tx.set(
      attemptRef,
      {
        uid,
        challengeDate,
        used: max,
        max,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * If upload/commit failed and there is still no video for this day, restore one recording chance.
 * Fixes users who consumed an attempt before posting (older builds) or any partial failure path.
 */
export async function refundRecordingAttemptIfNoPostedVideo(args: { uid: string; challengeDate: string }) {
  const { uid, challengeDate } = args;
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);
  const videoRef = doc(firestore(), 'videos', `${uid}_${challengeDate}`);

  await runTransaction(firestore(), async (tx) => {
    const videoSnap = await tx.get(videoRef);
    if (videoSnap.exists()) return;

    const max = await maxAttemptsForChallengeDate(tx, challengeDate);
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    if (used <= 0) return;

    tx.set(
      attemptRef,
      {
        uid,
        challengeDate,
        used: Math.max(0, used - 1),
        max,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export function useAttemptsRemaining(
  uid: string | undefined,
  challengeDate: string,
  dailyMaxAttempts: number = DEFAULT_MAX_RECORDING_ATTEMPTS
) {
  const fallbackMax = normalizeMaxRecordingAttempts(dailyMaxAttempts);
  const [remaining, setRemaining] = React.useState(fallbackMax);

  React.useEffect(() => {
    if (!uid) {
      setRemaining(fallbackMax);
      return;
    }
    const ref = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);
    return onSnapshot(ref, (snap) => {
      const used = Number(snap.data()?.used ?? 0);
      /** Always cap against the live challenge setting (`fallbackMax`), not a stale ledger `max`. */
      const max = fallbackMax;
      setRemaining(Math.max(0, max - used));
    });
  }, [uid, challengeDate, fallbackMax]);

  return remaining;
}

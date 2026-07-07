import * as React from 'react';
import {
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type Transaction,
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import { isActiveLeapVideoDoc } from '../lib/leapVideoDoc';
import { BONUS_ATTEMPT_BASE_REDUCTION_INCHES } from '../lib/verticalScore';
import { withRetries } from '../utils/retry';
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
  /** Denormalized public avatar at post time (fallback when `users/{uid}` is slow or unavailable). */
  photoUrl?: string;
  challengeDate: string;
  challengeTitle: string;
  challengeSubtitle: string;
  prompt: string;
  /** Matches the day’s task length (seconds). */
  maxDurationSeconds: number;
  source: string;
  url: string;
  storagePath: string;
  /**
   * Companion PIP clip URL for BeReal-style dual-camera posts. When present,
   * feed/playback components render this as a muted PIP overlay on top of
   * the primary `url`. Absent on single-camera posts.
   */
  secondaryUrl?: string;
  secondaryStoragePath?: string;
  /**
   * When true on a dual-camera post, the front camera was the big view at capture
   * time and the back camera (PIP) carries the sole audio track.
   */
  dualFrontIsPrimary?: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
};

export async function commitPostedVideo(args: { payload: PostedVideoPayload }) {
  const { payload } = args;

  return await runTransaction(firestore(), async (tx) => {
    const videoRef = doc(firestore(), 'videos', `${payload.uid}_${payload.challengeDate}`);
    const attemptRef = doc(firestore(), 'postAttempts', `${payload.uid}_${payload.challengeDate}`);

    const videoSnap = await tx.get(videoRef);
    if (videoSnap.exists()) {
      const existing = videoSnap.data() as {
        deleted?: boolean;
        uid?: string;
        moderationStatus?: string;
      } | undefined;
      if (isActiveLeapVideoDoc(existing, payload.uid)) {
        throw new Error('You already posted today.');
      }
      // Soft-deleted or stale row — remove so create rules apply to the new post.
      tx.delete(videoRef);
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

    const max = await maxAttemptsForChallengeDate(tx, payload.challengeDate);
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    if (used < max) {
      const baseReduction = Number(attemptSnap.data()?.leapBaseReductionInches ?? 0);
      const bonus = Number(attemptSnap.data()?.bonusRecordingAttempts ?? 0);
      const patch: Record<string, unknown> = {
        uid: payload.uid,
        challengeDate: payload.challengeDate,
        used: max,
        max,
        updatedAt: serverTimestamp(),
      };
      if (baseReduction > 0) {
        patch.leapBaseReductionInches = baseReduction;
      }
      if (bonus > 0) {
        patch.bonusRecordingAttempts = bonus;
      }
      tx.set(attemptRef, patch, { merge: true });
    }

    return { videoId: videoRef.id };
  });
}

/** Inches deducted from leap base (not day totals) when a bonus recording attempt is purchased. */
export const ATTEMPT_PURCHASE_BASE_REDUCTION_INCHES = BONUS_ATTEMPT_BASE_REDUCTION_INCHES;

export async function consumeRecordingAttempt(args: { uid: string; challengeDate: string }) {
  const { uid, challengeDate } = args;
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);

  return await runTransaction(firestore(), async (tx) => {
    const max = await maxAttemptsForChallengeDate(tx, challengeDate);
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    const bonus = Number(attemptSnap.data()?.bonusRecordingAttempts ?? 0);
    const baseReduction = Number(attemptSnap.data()?.leapBaseReductionInches ?? 0);

    if (used >= max) {
      if (bonus <= 0) {
        throw new Error('No attempts remaining today.');
      }
      const nextBonus = bonus - 1;
      const patch: Record<string, unknown> = {
        uid,
        challengeDate,
        used,
        max,
        updatedAt: serverTimestamp(),
      };
      if (nextBonus > 0) {
        patch.bonusRecordingAttempts = nextBonus;
      } else {
        patch.bonusRecordingAttempts = deleteField();
      }
      if (baseReduction > 0) {
        patch.leapBaseReductionInches = baseReduction;
      }
      tx.set(attemptRef, patch, { merge: true });
      return { usedAfter: used, bonusAfter: nextBonus };
    }

    const patch: Record<string, unknown> = {
      uid,
      challengeDate,
      used: used + 1,
      max,
      updatedAt: serverTimestamp(),
    };
    if (bonus > 0) {
      patch.bonusRecordingAttempts = bonus;
    }
    if (baseReduction > 0) {
      patch.leapBaseReductionInches = baseReduction;
    }
    tx.set(attemptRef, patch, { merge: true });

    return { usedAfter: used + 1, bonusAfter: bonus };
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
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    if (used >= max) return;

    const baseReduction = Number(attemptSnap.data()?.leapBaseReductionInches ?? 0);
    const bonus = Number(attemptSnap.data()?.bonusRecordingAttempts ?? 0);
    const patch: Record<string, unknown> = {
      uid,
      challengeDate,
      used: max,
      max,
      updatedAt: serverTimestamp(),
    };
    if (baseReduction > 0) {
      patch.leapBaseReductionInches = baseReduction;
    }
    if (bonus > 0) {
      patch.bonusRecordingAttempts = bonus;
    }
    tx.set(attemptRef, patch, { merge: true });
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
    if (videoSnap.exists() && isActiveLeapVideoDoc(videoSnap.data(), uid)) {
      return;
    }
    if (videoSnap.exists()) {
      tx.delete(videoRef);
    }

    const max = await maxAttemptsForChallengeDate(tx, challengeDate);
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    if (used <= 0) return;

    const baseReduction = Number(attemptSnap.data()?.leapBaseReductionInches ?? 0);
    const bonus = Number(attemptSnap.data()?.bonusRecordingAttempts ?? 0);
    const patch: Record<string, unknown> = {
      uid,
      challengeDate,
      used: Math.max(0, used - 1),
      max,
      updatedAt: serverTimestamp(),
    };
    if (baseReduction > 0) {
      patch.leapBaseReductionInches = baseReduction;
    }
    if (bonus > 0) {
      patch.bonusRecordingAttempts = bonus;
    }
    tx.set(attemptRef, patch, { merge: true });
  });
}

export function useAttemptsRemaining(
  uid: string | undefined,
  challengeDate: string,
  dailyMaxAttempts: number = DEFAULT_MAX_RECORDING_ATTEMPTS,
  staffUnlimited?: boolean
) {
  const fallbackMax = normalizeMaxRecordingAttempts(dailyMaxAttempts);
  const [remaining, setRemaining] = React.useState(fallbackMax);

  React.useEffect(() => {
    if (staffUnlimited) {
      setRemaining(fallbackMax);
      return;
    }
    if (!uid) {
      setRemaining(fallbackMax);
      return;
    }
    const ref = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);
    return onSnapshot(ref, (snap) => {
      const used = Number(snap.data()?.used ?? 0);
      const bonus = Number(snap.data()?.bonusRecordingAttempts ?? 0);
      /** Always cap against the live challenge setting (`fallbackMax`), not a stale ledger `max`. */
      const max = fallbackMax;
      setRemaining(Math.max(0, max - used + bonus));
    });
  }, [uid, challengeDate, fallbackMax, staffUnlimited]);

  return staffUnlimited ? fallbackMax : remaining;
}

/**
 * Fresh recording attempts after the user deletes their post for the day.
 * Idempotent: also heals users stuck with no active video but a spent ledger.
 */
export async function resetRecordingAttemptsAfterVideoDelete(args: {
  uid: string;
  challengeDate: string;
  /** User explicitly deleted their post — remove any active video and always restore attempts. */
  forceClearActiveVideo?: boolean;
}) {
  const { uid, challengeDate, forceClearActiveVideo = false } = args;
  const videoRef = doc(firestore(), 'videos', `${uid}_${challengeDate}`);
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);

  await withRetries(
    () =>
      runTransaction(firestore(), async (tx) => {
        const videoSnap = await tx.get(videoRef);
        if (videoSnap.exists()) {
          const existing = videoSnap.data() as {
            deleted?: boolean;
            moderationStatus?: string;
            uid?: string;
          } | undefined;
          if (isActiveLeapVideoDoc(existing, uid) && !forceClearActiveVideo) {
            return;
          }
          tx.delete(videoRef);
        }

        const max = await maxAttemptsForChallengeDate(tx, challengeDate);
        const attemptSnap = await tx.get(attemptRef);
        const used = Number(attemptSnap.data()?.used ?? 0);
        const bonus = Number(attemptSnap.data()?.bonusRecordingAttempts ?? 0);
        const hadVideo = videoSnap.exists();
        if (!forceClearActiveVideo && !hadVideo && used <= 0 && bonus <= 0) {
          return;
        }

        tx.set(
          attemptRef,
          {
            uid,
            challengeDate,
            used: 0,
            max,
            updatedAt: serverTimestamp(),
            bonusRecordingAttempts: deleteField(),
            leapBaseReductionInches: deleteField(),
          },
          { merge: true }
        );
      }),
    { maxAttempts: 3 }
  );
}

/** Clears today's attempt ledger for an admin tester (used once per app session). */
export async function resetAdminRecordingAttemptsForToday(args: {
  uid: string;
  challengeDate: string;
  dailyMaxAttempts: number;
}) {
  const { uid, challengeDate, dailyMaxAttempts } = args;
  const max = normalizeMaxRecordingAttempts(dailyMaxAttempts);
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);
  const existing = await getDoc(attemptRef);
  const hadBonus = existing.data()?.bonusRecordingAttempts != null;

  await setDoc(
    attemptRef,
    {
      uid,
      challengeDate,
      used: 0,
      max,
      ...(hadBonus ? { bonusRecordingAttempts: deleteField() } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

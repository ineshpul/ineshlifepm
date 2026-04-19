import * as React from 'react';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';

const MAX_TRIES = 1;

export type PostedVideoPayload = {
  uid: string;
  username: string;
  challengeDate: string;
  challengeTitle: string;
  challengeSubtitle: string;
  prompt: string;
  /** Matches the day’s task length (30 / 45 / 60). */
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
    });

    return { videoId: videoRef.id };
  });
}

export async function consumeRecordingAttempt(args: { uid: string; challengeDate: string }) {
  const { uid, challengeDate } = args;
  const attemptRef = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);

  return await runTransaction(firestore(), async (tx) => {
    const attemptSnap = await tx.get(attemptRef);
    const used = Number(attemptSnap.data()?.used ?? 0);
    if (used >= MAX_TRIES) {
      throw new Error('No attempts remaining today.');
    }

    tx.set(
      attemptRef,
      {
        uid,
        challengeDate,
        used: used + 1,
        max: MAX_TRIES,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { usedAfter: used + 1 };
  });
}

export function useAttemptsRemaining(uid: string | undefined, challengeDate: string) {
  const [remaining, setRemaining] = React.useState(MAX_TRIES);

  React.useEffect(() => {
    if (!uid) {
      setRemaining(MAX_TRIES);
      return;
    }
    const ref = doc(firestore(), 'postAttempts', `${uid}_${challengeDate}`);
    return onSnapshot(ref, (snap) => {
      const used = Number(snap.data()?.used ?? 0);
      setRemaining(Math.max(0, MAX_TRIES - used));
    });
  }, [uid, challengeDate]);

  return remaining;
}

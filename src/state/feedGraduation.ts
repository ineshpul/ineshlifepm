import * as React from 'react';
import { doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export function useFeedGraduationSeen(uid: string | undefined) {
  const [graduationSeen, setGraduationSeen] = React.useState(true);
  const [graduationSeenHydrated, setGraduationSeenHydrated] = React.useState(false);

  React.useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setGraduationSeen(false);
      setGraduationSeenHydrated(true);
      return;
    }

    const ref = doc(firestore(), 'users', uid);
    return onSnapshot(
      ref,
      (snap) => {
        setGraduationSeen(Boolean(snap.data()?.feedGraduationSeenAt));
        setGraduationSeenHydrated(true);
      },
      () => {
        setGraduationSeen(false);
        setGraduationSeenHydrated(true);
      }
    );
  }, [uid]);

  return { graduationSeen, graduationSeenHydrated };
}

export async function markFeedGraduationSeen(uid: string): Promise<void> {
  if (!uid || !isFirebaseConfigured()) return;

  const ref = doc(firestore(), 'users', uid);
  try {
    await runTransaction(firestore(), async (tx) => {
      const snap = await tx.get(ref);
      if (snap.data()?.feedGraduationSeenAt) return;
      if (snap.exists()) {
        tx.update(ref, { feedGraduationSeenAt: serverTimestamp() });
      } else {
        tx.set(ref, { feedGraduationSeenAt: serverTimestamp() }, { merge: true });
      }
    });
  } catch {
    // Best-effort — graduation UI still dismisses locally.
  }
}

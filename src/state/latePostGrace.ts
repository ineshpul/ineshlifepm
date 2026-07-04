import * as React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export type LatePostGrace = {
  active: boolean;
  challengeDate: string;
  expiresAtMs: number;
};

const INACTIVE: LatePostGrace = { active: false, challengeDate: '', expiresAtMs: 0 };

/** Server-granted window to post for a prior leap day (streak credit uses `videos.challengeDate`). */
export function useLatePostGrace(uid: string | undefined): LatePostGrace {
  const [grant, setGrant] = React.useState<LatePostGrace>(INACTIVE);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  void tick;

  React.useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setGrant(INACTIVE);
      return;
    }
    const ref = doc(firestore(), 'config', 'latePostGrants');
    return onSnapshot(
      ref,
      (snap) => {
        const byUid = (snap.data()?.byUid ?? {}) as Record<
          string,
          { challengeDate?: string; expiresAtMs?: number }
        >;
        const entry = byUid[uid];
        if (!entry) {
          setGrant(INACTIVE);
          return;
        }
        const expiresAtMs = Number(entry.expiresAtMs ?? 0);
        const challengeDate = String(entry.challengeDate ?? '').trim();
        const active = Boolean(challengeDate && expiresAtMs > Date.now());
        setGrant({ active, challengeDate, expiresAtMs });
      },
      () => setGrant(INACTIVE)
    );
  }, [uid]);

  return grant;
}

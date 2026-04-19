import * as React from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export function useLiveCount(dateKey: string) {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!isFirebaseConfigured()) {
        setCount(null);
        return;
      }
      try {
        const q = query(
          collection(firestore(), 'videos'),
          where('challengeDate', '==', dateKey),
          where('moderationStatus', '==', 'approved')
        );
        const snap = await getCountFromServer(q);
        if (!alive) return;
        setCount(snap.data().count);
      } catch {
        if (!alive) return;
        setCount(null);
      }
    };

    run();
    const id = setInterval(run, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [dateKey]);

  return count;
}


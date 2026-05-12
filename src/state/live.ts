import * as React from 'react';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

function cacheKey(dateKey: string) {
  return `liveCount:${dateKey}`;
}

export function useLiveCount(dateKey: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
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
        const next = snap.data().count;
        setCount(next);
        void AsyncStorage.setItem(cacheKey(dateKey), String(next)).catch(() => {});
      } catch {
        if (!alive) return;
        setCount(null);
      }
    };

    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey(dateKey));
        if (!alive) return;
        const n = cached != null ? Number(cached) : NaN;
        if (Number.isFinite(n)) setCount(n);
      } catch {
        // ignore cache errors
      } finally {
        await run();
      }
    })();
    const id = setInterval(run, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [dateKey, enabled]);

  return count;
}


import * as React from 'react';
import { collection, doc, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { challengeDateKeysForFirestoreIn, normalizeNyDateKey } from '../utils/nyTime';

const STATS_COLLECTION = 'dailyChallengeStats';

function cacheKey(dateKey: string) {
  return `liveCount:${dateKey}`;
}

/**
 * Approved posts for today's leap — reads `dailyChallengeStats/{dayKey}.approvedPostCount`
 * and cross-checks with a Firestore count on `videos` (handles unpadded `challengeDate` strings).
 */
export function useLiveCount(dateKey: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    let alive = true;
    const canonicalKey = normalizeNyDateKey(dateKey, dateKey);

    const applyCount = (next: number) => {
      if (!alive || !Number.isFinite(next) || next < 0) return;
      setCount(next);
      void AsyncStorage.setItem(cacheKey(dateKey), String(next)).catch(() => {});
    };

    const countApprovedVideos = async () => {
      const keys = challengeDateKeysForFirestoreIn([dateKey]);
      if (!keys.length) return null;
      const q = query(
        collection(firestore(), 'videos'),
        where('challengeDate', 'in', keys),
        where('moderationStatus', '==', 'approved')
      );
      const snap = await getCountFromServer(q);
      return snap.data().count;
    };

    const run = async () => {
      if (!isFirebaseConfigured()) {
        setCount(null);
        return;
      }
      try {
        const videoCount = await countApprovedVideos();
        if (!alive || videoCount == null) return;
        setCount((prev) => {
          const next = Math.max(prev ?? 0, videoCount);
          void AsyncStorage.setItem(cacheKey(dateKey), String(next)).catch(() => {});
          return next;
        });
      } catch (e) {
        if (__DEV__) console.warn('[live] approved video count failed', { dateKey, canonicalKey, e });
        if (!alive) return;
        setCount(null);
      }
    };

    let unsubStats: (() => void) | undefined;
    if (isFirebaseConfigured()) {
      unsubStats = onSnapshot(
        doc(firestore(), STATS_COLLECTION, canonicalKey),
        (snap) => {
          const statsCount = Number(snap.data()?.approvedPostCount);
          if (!Number.isFinite(statsCount) || statsCount < 0) return;
          if (__DEV__) {
            console.log('[live] dailyChallengeStats', {
              dayKey: canonicalKey,
              approvedPostCount: statsCount,
            });
          }
          applyCount(statsCount);
        },
        (err) => {
          if (__DEV__) console.warn('[live] dailyChallengeStats listener failed', canonicalKey, err);
        }
      );
    }

    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey(dateKey));
        if (!alive) return;
        const n = cached != null ? Number(cached) : NaN;
        if (Number.isFinite(n) && n > 0) setCount(n);
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
      unsubStats?.();
    };
  }, [dateKey, enabled]);

  return count;
}

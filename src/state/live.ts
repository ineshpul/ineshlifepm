import * as React from 'react';
import { collection, doc, getCountFromServer, onSnapshot, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { getDayKey } from '../lib/leapDayKey';
import { challengeDateKeysForFirestoreIn } from '../utils/nyTime';

const STATS_COLLECTION = 'dailyChallengeStats';

function cacheKey(dayKey: string) {
  return `liveCount:${dayKey}`;
}

function mergeCounts(...values: Array<number | null | undefined>): number | null {
  const nums = values.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/**
 * Approved posts for today's leap — `dailyChallengeStats/{dayKey}.approvedPostCount`
 * plus Firestore count on approved `videos` (same `dayKey`, padded + compact `challengeDate`).
 */
export function useLiveCount(dayKey: string, opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    let alive = true;

    const leapDayKeyNow = getDayKey('America/New_York');
    console.log('[live] posted today read', {
      queryDayKey: dayKey,
      leapDayKeyNow,
      dayKeysMatch: dayKey === leapDayKeyNow,
      statsDocPath: `${STATS_COLLECTION}/${dayKey}`,
    });

    const applyCount = (next: number | null) => {
      if (!alive || next == null) return;
      setCount(next);
      void AsyncStorage.setItem(cacheKey(dayKey), String(next)).catch(() => {});
    };

    const countApprovedVideos = async (): Promise<number | null> => {
      const keys = challengeDateKeysForFirestoreIn([dayKey]);
      if (!keys.length) return null;
      const q = query(
        collection(firestore(), 'videos'),
        where('challengeDate', 'in', keys),
        where('moderationStatus', '==', 'approved')
      );
      const snap = await getCountFromServer(q);
      const videoCount = snap.data().count;
      console.log('[live] posted today video count', { dayKey, keys, videoCount });
      return videoCount;
    };

    const run = async () => {
      if (!isFirebaseConfigured()) {
        setCount(null);
        return;
      }
      try {
        const videoCount = await countApprovedVideos();
        if (!alive) return;
        setCount((prev) => {
          const next = mergeCounts(prev, videoCount);
          if (next != null) {
            void AsyncStorage.setItem(cacheKey(dayKey), String(next)).catch(() => {});
          }
          return next;
        });
      } catch (e) {
        console.warn('[live] posted today video count failed', { dayKey, leapDayKeyNow, e });
        if (!alive) return;
        setCount((prev) => prev);
      }
    };

    let unsubStats: (() => void) | undefined;
    if (isFirebaseConfigured()) {
      unsubStats = onSnapshot(
        doc(firestore(), STATS_COLLECTION, dayKey),
        (snap) => {
          const statsCount = Number(snap.data()?.approvedPostCount);
          console.log('[live] posted today stats snapshot', {
            dayKey,
            exists: snap.exists(),
            approvedPostCount: snap.data()?.approvedPostCount,
          });
          if (!Number.isFinite(statsCount) || statsCount < 0) return;
          setCount((prev) => {
            const next = mergeCounts(prev, statsCount);
            if (next != null) {
              void AsyncStorage.setItem(cacheKey(dayKey), String(next)).catch(() => {});
            }
            return next;
          });
        },
        (err) => {
          console.warn('[live] posted today stats listener failed', { dayKey, err });
        }
      );
    }

    void (async () => {
      try {
        const cached = await AsyncStorage.getItem(cacheKey(dayKey));
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
  }, [dayKey, enabled]);

  return count;
}

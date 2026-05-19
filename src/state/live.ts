import * as React from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { useAuth } from './auth';
import {
  getDayKey,
  todayPostedCountChallengeDateInKeys,
  todayPostedCountStatsDocKeys,
} from '../lib/leapDayKey';

const STATS_COLLECTION = 'dailyChallengeStats';
const VIDEO_QUERY_LIMIT = 400;

function countApprovedFromSnapshot(
  docs: Array<{ data: () => Record<string, unknown> }>
): number {
  let n = 0;
  for (const d of docs) {
    const data = d.data();
    if (data.deleted === true) continue;
    if (String(data.moderationStatus ?? '') !== 'approved') continue;
    n += 1;
  }
  return n;
}

/**
 * Live approved-post count for today's leap (noon→noon NY).
 * Uses the same `challengeDate` keys as Feed + realtime listeners (not getCountFromServer).
 */
export function useLiveCount(opts?: { enabled?: boolean }) {
  const enabled = opts?.enabled !== false;
  const { user } = useAuth();
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled || !user?.uid) {
      setCount(null);
      return;
    }
    if (!isFirebaseConfigured()) {
      setCount(null);
      return;
    }

    let alive = true;
    let videoCount = 0;
    const statsTotals = new Map<string, number>();

    const publish = () => {
      if (!alive) return;
      let statsSum = 0;
      let hasStats = false;
      for (const v of statsTotals.values()) {
        if (Number.isFinite(v) && v >= 0) {
          statsSum += v;
          hasStats = true;
        }
      }
      const next = hasStats ? Math.max(statsSum, videoCount) : videoCount;
      setCount(next);
    };

    const setup = () => {
      const nowMs = Date.now();
      const leapDayKeyNow = getDayKey('America/New_York', nowMs);
      const inKeys = todayPostedCountChallengeDateInKeys(nowMs);
      const statsDocKeys = todayPostedCountStatsDocKeys(nowMs);

      console.log('[live] posted today read', {
        leapDayKeyNow,
        challengeDateInKeys: inKeys,
        statsDocKeys,
        statsDocPaths: statsDocKeys.map((k) => `${STATS_COLLECTION}/${k}`),
      });

      if (inKeys.length === 0) {
        videoCount = 0;
        publish();
        return () => {};
      }

      const videosQ = query(
        collection(firestore(), 'videos'),
        where('challengeDate', 'in', inKeys),
        where('moderationStatus', '==', 'approved'),
        limit(VIDEO_QUERY_LIMIT)
      );

      const unsubVideos = onSnapshot(
        videosQ,
        (snap) => {
          videoCount = countApprovedFromSnapshot(snap.docs);
          console.log('[live] posted today videos snapshot', {
            leapDayKeyNow,
            inKeys,
            size: snap.size,
            counted: videoCount,
          });
          publish();
        },
        (err) => {
          console.warn('[live] posted today videos listener failed', { leapDayKeyNow, inKeys, err });
        }
      );

      const unsubStatsList = statsDocKeys.map((statsKey) =>
        onSnapshot(
          doc(firestore(), STATS_COLLECTION, statsKey),
          (snap) => {
            const raw = snap.data()?.approvedPostCount;
            const n = Number(raw);
            if (snap.exists() && Number.isFinite(n) && n >= 0) {
              statsTotals.set(statsKey, n);
            } else {
              statsTotals.delete(statsKey);
            }
            console.log('[live] posted today stats snapshot', {
              statsKey,
              exists: snap.exists(),
              approvedPostCount: raw,
            });
            publish();
          },
          (err) => {
            console.warn('[live] posted today stats listener failed', { statsKey, err });
          }
        )
      );

      return () => {
        unsubVideos();
        for (const u of unsubStatsList) u();
      };
    };

    let teardown = setup();
    const keyRefresh = setInterval(() => {
      teardown();
      statsTotals.clear();
      videoCount = 0;
      teardown = setup();
    }, 60_000);

    return () => {
      alive = false;
      clearInterval(keyRefresh);
      teardown();
    };
  }, [enabled, user?.uid]);

  return count;
}

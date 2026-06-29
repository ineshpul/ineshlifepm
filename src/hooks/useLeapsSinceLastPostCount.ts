import * as React from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { challengeDateInKeysForLeapDay, statsDocKeysForLeapDay } from '../lib/leapDayKey';
import { missedLeapDayKeysSinceLastPost } from '../state/feedGate';

const STATS_COLLECTION = 'dailyChallengeStats';
const VIDEO_QUERY_LIMIT = 400;

function approvedCountFromStats(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const n = Number(data.approvedPostCount);
  if (Number.isFinite(n) && n >= 0) return n;
  const counted = data.countedApprovedVideoIds;
  if (counted && typeof counted === 'object' && !Array.isArray(counted)) {
    const keys = Object.keys(counted as Record<string, unknown>).filter((k) =>
      Boolean((counted as Record<string, unknown>)[k])
    );
    if (keys.length > 0) return keys.length;
  }
  return null;
}

function countApprovedInSnapshot(
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
 * Approved leaps posted on leap days after the viewer's last post, through the active cycle.
 * Sums per-day counts so multiple missed days accumulate.
 */
export function useLeapsSinceLastPostCount(args: {
  enabled: boolean;
  postedDates: ReadonlySet<string>;
  viewingChallengeDateKey: string;
}) {
  const { enabled, postedDates, viewingChallengeDateKey } = args;
  const [count, setCount] = React.useState<number | null>(null);
  const [ready, setReady] = React.useState(!enabled);

  const missedDayKeys = React.useMemo(
    () =>
      enabled
        ? missedLeapDayKeysSinceLastPost({ postedDates, viewingChallengeDateKey })
        : [],
    [enabled, postedDates, viewingChallengeDateKey]
  );

  React.useEffect(() => {
    if (!enabled || !isFirebaseConfigured()) {
      setCount(null);
      setReady(true);
      return;
    }

    if (missedDayKeys.length === 0) {
      setCount(0);
      setReady(true);
      return;
    }

    let alive = true;
    setReady(false);
    const dayCounts = new Map<string, number>();

    const publish = () => {
      if (!alive) return;
      let sum = 0;
      for (const dayKey of missedDayKeys) {
        sum += dayCounts.get(dayKey) ?? 0;
      }
      setCount(sum);
      setReady(true);
    };

    const unsubs: Array<() => void> = [];

    for (const leapDayKey of missedDayKeys) {
      const inKeys = challengeDateInKeysForLeapDay(leapDayKey);
      const statsKeys = statsDocKeysForLeapDay(leapDayKey);
      const statsTotals = new Map<string, number>();
      let videoCount = 0;
      let videosSnapReady = false;

      const publishDay = () => {
        let statsSum = 0;
        let hasStats = false;
        for (const v of statsTotals.values()) {
          if (Number.isFinite(v) && v >= 0) {
            statsSum += v;
            hasStats = true;
          }
        }
        const next = videosSnapReady
          ? videoCount
          : Math.max(hasStats ? statsSum : 0, videoCount);
        dayCounts.set(leapDayKey, next);
        publish();
      };

      if (inKeys.length > 0) {
        const videosQ = query(
          collection(firestore(), 'videos'),
          where('challengeDate', 'in', inKeys),
          where('moderationStatus', '==', 'approved'),
          orderBy('createdAt', 'desc'),
          limit(VIDEO_QUERY_LIMIT)
        );
        unsubs.push(
          onSnapshot(
            videosQ,
            (snap) => {
              videosSnapReady = true;
              videoCount = countApprovedInSnapshot(snap.docs);
              publishDay();
            },
            () => publishDay()
          )
        );
      }

      for (const statsKey of statsKeys) {
        unsubs.push(
          onSnapshot(
            doc(firestore(), STATS_COLLECTION, statsKey),
            (snap) => {
              const statsCount = approvedCountFromStats(
                snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
              );
              if (statsCount != null) {
                statsTotals.set(statsKey, statsCount);
              } else {
                statsTotals.delete(statsKey);
              }
              publishDay();
            },
            () => publishDay()
          )
        );
      }

      publishDay();
    }

    return () => {
      alive = false;
      for (const u of unsubs) u();
    };
  }, [enabled, missedDayKeys]);

  return { leapsSinceLastPost: count, leapsSinceLastPostReady: ready, missedDayKeys };
}

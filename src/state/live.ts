import * as React from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import {
  challengeDateInKeysForLeapDay,
  getDayKey,
  statsDocKeysForLeapDay,
} from '../lib/leapDayKey';
import { useAuth } from './auth';

const STATS_COLLECTION = 'dailyChallengeStats';
const VIDEO_QUERY_LIMIT = 400;
const LISTENER_RETRY_MS = 2500;

/** Last successful count per signed-in user + leap day (survives brief listener gaps). */
const countCache = new Map<string, number>();

function countCacheKey(uid: string, leapDayKey: string) {
  return `${uid}:${leapDayKey}`;
}

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

/** Count docs returned by the Firestore query (already filtered by `challengeDate` + approved). */
function countApprovedInSnapshot(
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
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
 * Uses the same `challengeDate` keys + query shape as Feed (`orderBy createdAt desc`).
 */
export function useLiveCount(opts?: { enabled?: boolean; challengeDateKey?: string }) {
  const enabled = opts?.enabled !== false;
  const challengeDateKeyProp = opts?.challengeDateKey;
  const { user, authReady } = useAuth();
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    if (!isFirebaseConfigured() || !authReady || !user?.uid) {
      return;
    }

    let alive = true;
    let videoCount = 0;
    const statsTotals = new Map<string, number>();
    let publishCount: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const publish = () => {
      if (!alive || !publishCount) return;
      publishCount();
    };

    const setup = () => {
      const nowMs = Date.now();
      const leapDayKey =
        challengeDateKeyProp ?? getDayKey('America/New_York', nowMs);
      const inKeys = challengeDateInKeysForLeapDay(leapDayKey, nowMs);
      const statsDocKeys = statsDocKeysForLeapDay(leapDayKey, nowMs);
      const cacheKey = countCacheKey(user.uid, leapDayKey);

      publishCount = () => {
        let statsSum = 0;
        let hasStats = false;
        for (const v of statsTotals.values()) {
          if (Number.isFinite(v) && v >= 0) {
            statsSum += v;
            hasStats = true;
          }
        }
        const next = Math.max(hasStats ? statsSum : 0, videoCount);
        countCache.set(cacheKey, next);
        setCount(next);
      };

      const cached = countCache.get(cacheKey);
      if (cached != null && Number.isFinite(cached)) {
        setCount(cached);
      } else {
        publish();
      }

      console.log('[live] posted today read', {
        leapDayKey,
        challengeDateInKeys: inKeys,
        statsDocKeys,
        statsDocPaths: statsDocKeys.map((k) => `${STATS_COLLECTION}/${k}`),
        cachedCount: cached ?? null,
      });

      if (inKeys.length === 0) {
        videoCount = 0;
        publish();
        return () => {};
      }

      const scheduleRetry = () => {
        if (!alive || retryTimer != null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!alive) return;
          teardown();
          statsTotals.clear();
          videoCount = 0;
          teardown = setup();
        }, LISTENER_RETRY_MS);
      };

      const videosQ = query(
        collection(firestore(), 'videos'),
        where('challengeDate', 'in', inKeys),
        where('moderationStatus', '==', 'approved'),
        orderBy('createdAt', 'desc'),
        limit(VIDEO_QUERY_LIMIT)
      );

      const unsubVideos = onSnapshot(
        videosQ,
        (snap) => {
          if (retryTimer) {
            clearTimeout(retryTimer);
            retryTimer = null;
          }
          videoCount = countApprovedInSnapshot(snap.docs);
          console.log('[live] posted today videos snapshot', {
            leapDayKey,
            inKeys,
            size: snap.size,
            counted: videoCount,
            fromCache: snap.metadata.fromCache,
          });
          publish();
        },
        (err) => {
          console.warn('[live] posted today videos listener failed', { leapDayKey, inKeys, err });
          publish();
          scheduleRetry();
        }
      );

      const unsubStatsList = statsDocKeys.map((statsKey) =>
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
            console.log('[live] posted today stats snapshot', {
              statsKey,
              exists: snap.exists(),
              approvedPostCount: snap.data()?.approvedPostCount,
              statsCount,
            });
            publish();
          },
          (err) => {
            console.warn('[live] posted today stats listener failed', { statsKey, err });
            publish();
          }
        )
      );

      return () => {
        unsubVideos();
        for (const u of unsubStatsList) u();
      };
    };

    let teardown = () => {};

    void firebaseAuth()
      .authStateReady()
      .then(() => {
        if (!alive) return;
        teardown = setup();
      })
      .catch((err) => {
        console.warn('[live] posted today authStateReady failed', err);
        if (!alive) return;
        teardown = setup();
      });

    const keyRefresh = setInterval(() => {
      teardown();
      statsTotals.clear();
      videoCount = 0;
      teardown = setup();
    }, 60_000);

    return () => {
      alive = false;
      publishCount = null;
      clearInterval(keyRefresh);
      if (retryTimer) clearTimeout(retryTimer);
      teardown();
    };
  }, [enabled, authReady, user?.uid, challengeDateKeyProp]);

  return count;
}

import * as React from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import {
  challengeDateInKeysForLeapDay,
  getDayKey,
  statsDocKeysForLeapDay,
} from '../lib/leapDayKey';
import { normalizeNyDateKey } from '../utils/nyTime';
import { useAuth } from './auth';

const STATS_COLLECTION = 'dailyChallengeStats';
const VIDEO_QUERY_LIMIT = 400;
const LISTENER_RETRY_MS = 2500;

/** Last successful count per signed-in user + leap day (survives brief listener gaps). */
const countCache = new Map<string, number>();

function countCacheKey(uid: string, leapDayKey: string) {
  return `${uid}:${leapDayKey}`;
}

function postedCountFromStats(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  // Prefer submission count (pending + approved) so moderation lag does not zero the Today label.
  const posted = Number(data.postedPostCount);
  if (Number.isFinite(posted) && posted >= 0) return posted;
  const approved = Number(data.approvedPostCount);
  if (Number.isFinite(approved) && approved >= 0) return approved;
  const countedPosted = data.countedPostedVideoIds;
  if (countedPosted && typeof countedPosted === 'object' && !Array.isArray(countedPosted)) {
    const keys = Object.keys(countedPosted as Record<string, unknown>).filter((k) =>
      Boolean((countedPosted as Record<string, unknown>)[k])
    );
    if (keys.length > 0) return keys.length;
  }
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
 * Prefers the max of `dailyChallengeStats` and the approved-videos query so a brief empty
 * videos snapshot cannot wipe a real stats count (which was showing "0 posted today").
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
      // Keep last known count while auth hydrates — avoid flashing "— posted today".
      return;
    }

    let alive = true;
    let videoCount = 0;
    let videosSnapReady = false;
    const statsTotals = new Map<string, number>();
    let publishCount: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const publish = () => {
      if (!alive || !publishCount) return;
      publishCount();
    };

    const setup = () => {
      const nowMs = Date.now();
      const fallbackLeap = getDayKey('America/New_York', nowMs);
      const leapDayKey = normalizeNyDateKey(String(challengeDateKeyProp ?? '').trim(), fallbackLeap);
      const inKeys = challengeDateInKeysForLeapDay(leapDayKey, nowMs);
      const statsDocKeys = statsDocKeysForLeapDay(leapDayKey, nowMs);
      const cacheKey = countCacheKey(user.uid, leapDayKey);

      videosSnapReady = false;

      publishCount = () => {
        let statsSum = 0;
        let hasStats = false;
        for (const v of statsTotals.values()) {
          if (Number.isFinite(v) && v >= 0) {
            statsSum += v;
            hasStats = true;
          }
        }
        // Always take the higher signal. Stats alone used to be ignored after an empty
        // videos snapshot, which zeroed the Today "posted today" label.
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

      if (__DEV__) {
        console.log('[live] posted today read', {
          leapDayKey,
          challengeDateInKeys: inKeys,
          statsDocKeys,
          statsDocPaths: statsDocKeys.map((k) => `${STATS_COLLECTION}/${k}`),
          cachedCount: cached ?? null,
          videosSnapReady,
        });
      }

      const scheduleRetry = () => {
        if (!alive || retryTimer != null) return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!alive) return;
          teardown();
          statsTotals.clear();
          videoCount = 0;
          videosSnapReady = false;
          teardown = setup();
        }, LISTENER_RETRY_MS);
      };

      const unsubStatsList = statsDocKeys.map((statsKey) =>
        onSnapshot(
          doc(firestore(), STATS_COLLECTION, statsKey),
          (snap) => {
            const statsCount = postedCountFromStats(
              snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
            );
            if (statsCount != null) {
              statsTotals.set(statsKey, statsCount);
            } else {
              statsTotals.delete(statsKey);
            }
            if (__DEV__) {
              console.log('[live] posted today stats snapshot', {
                statsKey,
                exists: snap.exists(),
                postedPostCount: snap.data()?.postedPostCount,
                approvedPostCount: snap.data()?.approvedPostCount,
                statsCount,
              });
            }
            publish();
          },
          (err) => {
            if (__DEV__) {
              console.warn('[live] posted today stats listener failed', { statsKey, err });
            }
            publish();
          }
        )
      );

      if (inKeys.length === 0) {
        videoCount = 0;
        videosSnapReady = true;
        publish();
        return () => {
          for (const u of unsubStatsList) u();
        };
      }

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
          videosSnapReady = true;
          videoCount = countApprovedInSnapshot(snap.docs);
          if (__DEV__) {
            console.log('[live] posted today videos snapshot', {
              leapDayKey,
              inKeys,
              size: snap.size,
              counted: videoCount,
              fromCache: snap.metadata.fromCache,
            });
          }
          publish();
        },
        (err) => {
          if (__DEV__) {
            console.warn('[live] posted today videos listener failed', { leapDayKey, inKeys, err });
          }
          // Keep stats-driven count; retry videos in case of transient permission/index errors.
          publish();
          scheduleRetry();
        }
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
        if (__DEV__) {
          console.warn('[live] posted today authStateReady failed', err);
        }
        if (!alive) return;
        teardown = setup();
      });

    const keyRefresh = setInterval(() => {
      teardown();
      statsTotals.clear();
      videoCount = 0;
      videosSnapReady = false;
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

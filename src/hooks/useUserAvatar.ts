import * as React from 'react';

import { fetchUserProfilesByIds } from '../lib/fetchUserProfiles';
import { photoUrlFromRecord } from '../lib/resolveProfileIdentity';

/**
 * Session cache of `users/{uid}.photoUrl` for surfaces that only carry a uid
 * (feed reels, comment rows). Reads are coalesced into one batched query per
 * tick so a fast swipe through the feed can't fan out into a read per row.
 */
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const waiters = new Map<string, Array<(url: string) => void>>();
let queue = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const BATCH_WINDOW_MS = 40;

function settle(uid: string, url: string, remember: boolean) {
  if (remember) cache.set(uid, url);
  inflight.delete(uid);
  const pending = waiters.get(uid);
  waiters.delete(uid);
  pending?.forEach((resolve) => resolve(url));
}

async function flushQueue() {
  flushTimer = null;
  const uids = [...queue];
  queue = new Set();
  if (uids.length === 0) return;

  try {
    const profiles = await fetchUserProfilesByIds(uids);
    uids.forEach((uid) => settle(uid, photoUrlFromRecord(profiles.get(uid) ?? null), true));
  } catch {
    // Leave the misses uncached so the next mount retries.
    uids.forEach((uid) => settle(uid, '', false));
  }
}

function requestAvatar(uid: string): Promise<string> {
  const existing = inflight.get(uid);
  if (existing) return existing;

  const promise = new Promise<string>((resolve) => {
    waiters.set(uid, [...(waiters.get(uid) ?? []), resolve]);
  });
  inflight.set(uid, promise);
  queue.add(uid);
  if (!flushTimer) flushTimer = setTimeout(() => void flushQueue(), BATCH_WINDOW_MS);
  return promise;
}

/** Drop a cached photo so the next read reflects a just-saved profile change. */
export function invalidateUserAvatar(uid: string | undefined | null) {
  const key = String(uid ?? '').trim();
  if (key) cache.delete(key);
}

/**
 * Resolves a user's profile photo URL, empty string while unknown or unset.
 * `seedUrl` is the denormalized photo on the row (when the document has one),
 * which renders immediately and skips the lookup entirely.
 */
export function useUserAvatar(uid: string | undefined, seedUrl?: string): string {
  const seed = (seedUrl ?? '').trim();
  const [url, setUrl] = React.useState(() => seed || (uid ? (cache.get(uid) ?? '') : ''));

  React.useEffect(() => {
    if (seed) {
      setUrl(seed);
      return;
    }
    if (!uid) {
      setUrl('');
      return;
    }

    const cached = cache.get(uid);
    if (cached !== undefined) {
      setUrl(cached);
      return;
    }

    let active = true;
    setUrl('');
    void requestAvatar(uid).then((next) => {
      if (active) setUrl(next);
    });
    return () => {
      active = false;
    };
  }, [uid, seed]);

  return url;
}

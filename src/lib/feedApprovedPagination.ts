import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import { challengeDateKeysForFirestoreIn } from '../utils/nyTime';

/** Approved feed page size — opening the feed issues one query of this size. */
export const FEED_APPROVED_PAGE_SIZE = 20;

/** Lightweight poll for new leaps since the last loaded post (no open listener). */
export const FEED_NEW_LEAPS_DETECT_LIMIT = 5;

export type FeedApprovedPageCursor = {
  /** Index into the NY leap day chain (0 = newest day). */
  dayIndex: number;
  /** Last Firestore doc from the current day, for `startAfter` within that day. */
  lastDoc: QueryDocumentSnapshot | null;
};

export type FetchApprovedFeedPageResult<T> = {
  videos: T[];
  cursor: FeedApprovedPageCursor;
  /** False when every day in the chain has been fully paginated. */
  hasMore: boolean;
  /** Snapshot of the last doc returned (for dedupe / debugging). */
  lastSnap: QueryDocumentSnapshot | null;
};

/**
 * Fetch the next page of approved feed videos.
 *
 * Ordering: walk {@link dayChain} newest→oldest. Within each day, `createdAt` desc with
 * `startAfter` on the last doc. When a day returns fewer than `pageSize` rows, advance to
 * the next day with a fresh query (no cursor) so day boundaries never skip or duplicate.
 */
export async function fetchNextApprovedFeedPage<T>(
  dayChain: readonly string[],
  cursor: FeedApprovedPageCursor,
  docToVideo: (d: QueryDocumentSnapshot) => T,
  opts?: { pageSize?: number; db?: Firestore }
): Promise<FetchApprovedFeedPageResult<T>> {
  const pageSize = opts?.pageSize ?? FEED_APPROVED_PAGE_SIZE;
  const db = opts?.db ?? firestore();
  let dayIndex = Math.max(0, Math.floor(cursor.dayIndex));
  let lastDoc = cursor.lastDoc;

  while (dayIndex < dayChain.length) {
    const dayKey = String(dayChain[dayIndex] ?? '').trim();
    if (!dayKey) {
      dayIndex += 1;
      lastDoc = null;
      continue;
    }

    const inVals = challengeDateKeysForFirestoreIn([dayKey]);
    if (inVals.length === 0) {
      dayIndex += 1;
      lastDoc = null;
      continue;
    }

    let q = query(
      collection(db, 'videos'),
      where('challengeDate', 'in', inVals),
      where('moderationStatus', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );
    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }

    const snap = await getDocs(q);
    const videos = snap.docs.map(docToVideo);
    const lastSnap = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1]! : null;

    if (snap.size < pageSize) {
      const nextCursor: FeedApprovedPageCursor = { dayIndex: dayIndex + 1, lastDoc: null };
      const hasMore = dayIndex + 1 < dayChain.length;
      return { videos, cursor: nextCursor, hasMore, lastSnap };
    }

    return {
      videos,
      cursor: { dayIndex, lastDoc: lastSnap },
      hasMore: true,
      lastSnap,
    };
  }

  return {
    videos: [],
    cursor: { dayIndex: dayChain.length, lastDoc: null },
    hasMore: false,
    lastSnap: null,
  };
}

/** First page only — used on open and pull-to-refresh. */
export async function fetchFirstApprovedFeedPage<T>(
  dayChain: readonly string[],
  docToVideo: (d: QueryDocumentSnapshot) => T,
  opts?: { pageSize?: number; db?: Firestore }
): Promise<FetchApprovedFeedPageResult<T>> {
  return fetchNextApprovedFeedPage(dayChain, { dayIndex: 0, lastDoc: null }, docToVideo, opts);
}

/**
 * Detect (and optionally preload) approved leaps newer than `afterCreatedAtMs` on the newest leap day.
 * One-shot `getDocs` — not a listener.
 *
 * Returns raw approved posts; callers must apply viewer visibility filters (friends / block / mute /
 * hidden) before showing a count or prepending into the feed.
 */
export async function fetchNewerApprovedFeedSince<T>(
  newestDayKey: string,
  afterCreatedAtMs: number,
  docToVideo: (d: QueryDocumentSnapshot) => T,
  opts?: { limit?: number; db?: Firestore }
): Promise<T[]> {
  const limitN = opts?.limit ?? FEED_NEW_LEAPS_DETECT_LIMIT;
  const db = opts?.db ?? firestore();
  const dayKey = String(newestDayKey ?? '').trim();
  if (!dayKey) return [];

  const inVals = challengeDateKeysForFirestoreIn([dayKey]);
  if (inVals.length === 0) return [];

  const base = [
    collection(db, 'videos'),
    where('challengeDate', 'in', inVals),
    where('moderationStatus', '==', 'approved'),
  ] as const;

  const q =
    afterCreatedAtMs > 0
      ? query(
          ...base,
          where('createdAt', '>', Timestamp.fromMillis(afterCreatedAtMs)),
          orderBy('createdAt', 'desc'),
          limit(limitN)
        )
      : query(...base, orderBy('createdAt', 'desc'), limit(limitN));

  const snap = await getDocs(q);
  return snap.docs.map(docToVideo);
}

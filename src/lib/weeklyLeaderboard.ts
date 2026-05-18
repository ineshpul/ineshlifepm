import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  challengeDateBelongsToLeapWeek,
  challengeDateKeysForFirestoreIn,
  normalizeNyDateKey,
  nySundayWeekDateKeys,
} from '../utils/nyTime';

export type WeeklyVideoScore = {
  uid: string;
  score: number;
  username: string;
};

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

function accumulateLeapInchesByUid(
  docs: { data: () => Record<string, unknown> }[],
  weekKey: string
): WeeklyVideoScore[] {
  const wk = normalizeNyDateKey(weekKey, '');
  const byUid = new Map<string, WeeklyVideoScore>();
  docs.forEach((d) => {
    const data = d.data();
    if (String(data.moderationStatus ?? '') === 'nulled') return;
    const uid = String(data.uid ?? '').trim();
    if (!uid) return;
    const cd = String(data.challengeDate ?? '').trim();
    if (!challengeDateBelongsToLeapWeek(cd, wk)) return;
    const raw = Number(data.leapInches ?? data.leapInchesAwarded ?? 0);
    const inch = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (inch <= 0) return;
    const username = String(data.username ?? 'user').trim() || 'user';
    const prev = byUid.get(uid);
    if (prev) {
      prev.score = Math.round((prev.score + inch) * 10) / 10;
      if (!prev.username && username) prev.username = username;
    } else {
      byUid.set(uid, { uid, score: inch, username });
    }
  });
  return Array.from(byUid.values()).filter((r) => r.score > 0);
}

async function fetchApprovedVideosForChallengeIn(
  inKeys: string[]
): Promise<QueryDocumentSnapshot[]> {
  if (inKeys.length === 0) return [];
  const out: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await getDocs(
      cursor
        ? query(
            collection(firestore(), 'videos'),
            where('challengeDate', 'in', inKeys.slice(0, 30)),
            where('moderationStatus', '==', 'approved'),
            orderBy('createdAt', 'desc'),
            startAfter(cursor),
            limit(PAGE_SIZE)
          )
        : query(
            collection(firestore(), 'videos'),
            where('challengeDate', 'in', inKeys.slice(0, 30)),
            where('moderationStatus', '==', 'approved'),
            orderBy('createdAt', 'desc'),
            limit(PAGE_SIZE)
          )
    );
    out.push(...snap.docs);
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/** Sum approved leap inches for one leap day (`challengeDate` / noon→noon). */
export async function leapDayLeaderboardFromVideos(leapDayKey: string): Promise<WeeklyVideoScore[]> {
  const dayKey = normalizeNyDateKey(leapDayKey, '');
  const inKeys = challengeDateKeysForFirestoreIn([dayKey]);
  if (inKeys.length === 0) return [];

  const docs = await fetchApprovedVideosForChallengeIn(inKeys);
  const byUid = new Map<string, WeeklyVideoScore>();
  docs.forEach((d) => {
    const data = d.data();
    if (String(data.moderationStatus ?? '') === 'nulled') return;
    const uid = String(data.uid ?? '').trim();
    if (!uid) return;
    const cd = String(data.challengeDate ?? '').trim();
    if (normalizeNyDateKey(cd, dayKey) !== dayKey) return;
    const raw = Number(data.leapInches ?? data.leapInchesAwarded ?? 0);
    const inch = Number.isFinite(raw) && raw > 0 ? raw : 0;
    if (inch <= 0) return;
    const username = String(data.username ?? 'user').trim() || 'user';
    const prev = byUid.get(uid);
    if (prev) {
      prev.score = Math.round((prev.score + inch) * 10) / 10;
    } else {
      byUid.set(uid, { uid, score: inch, username });
    }
  });
  return Array.from(byUid.values()).filter((r) => r.score > 0);
}

/**
 * Weekly leaperboard: one running total per user for the current leap week (Sun noon → next Sun noon).
 * Every approved post whose leap day falls in that week adds to the same aggregate (not a daily reset).
 */
export async function weeklyLeaderboardFromVideos(weekKey: string): Promise<WeeklyVideoScore[]> {
  const wk = normalizeNyDateKey(weekKey, '');
  const dateKeys = nySundayWeekDateKeys(wk);
  const inKeys = challengeDateKeysForFirestoreIn(dateKeys);
  if (inKeys.length === 0) return [];

  const docs = await fetchApprovedVideosForChallengeIn(inKeys);
  return accumulateLeapInchesByUid(docs, wk);
}

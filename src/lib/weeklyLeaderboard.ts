import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  challengeDateKeysForFirestoreIn,
  normalizeNyDateKey,
  nyLeapWeekStartKeyFromChallengeDate,
  nySundayWeekDateKeys,
} from '../utils/nyTime';

export type WeeklyVideoScore = {
  uid: string;
  score: number;
  username: string;
};

function accumulateLeapInchesByUid(
  docs: { data: () => Record<string, unknown> }[],
  includeChallengeDate: (challengeDate: string) => boolean
): WeeklyVideoScore[] {
  const byUid = new Map<string, WeeklyVideoScore>();
  docs.forEach((d) => {
    const data = d.data();
    if (String(data.moderationStatus ?? '') === 'nulled') return;
    const uid = String(data.uid ?? '').trim();
    if (!uid) return;
    const cd = String(data.challengeDate ?? '').trim();
    if (!includeChallengeDate(cd)) return;
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

/** Sum approved leap inches for one leap day (`challengeDate` / noon→noon). */
export async function leapDayLeaderboardFromVideos(leapDayKey: string): Promise<WeeklyVideoScore[]> {
  const dayKey = normalizeNyDateKey(leapDayKey, '');
  const inKeys = challengeDateKeysForFirestoreIn([dayKey]);
  if (inKeys.length === 0) return [];

  const snap = await getDocs(
    query(
      collection(firestore(), 'videos'),
      where('challengeDate', 'in', inKeys.slice(0, 30)),
      where('moderationStatus', '==', 'approved'),
      limit(500)
    )
  );
  return accumulateLeapInchesByUid(snap.docs, (cd) => normalizeNyDateKey(cd, dayKey) === dayKey);
}

/**
 * Sum approved leap inches per user for the NY leap week (Sun noon → next Sun noon).
 * Equals the sum of each leap day in that week (same source as {@link leapDayLeaderboardFromVideos}).
 */
export async function weeklyLeaderboardFromVideos(weekKey: string): Promise<WeeklyVideoScore[]> {
  const dateKeys = nySundayWeekDateKeys(weekKey);
  const inKeys = challengeDateKeysForFirestoreIn(dateKeys);
  if (inKeys.length === 0) return [];

  const snap = await getDocs(
    query(
      collection(firestore(), 'videos'),
      where('challengeDate', 'in', inKeys.slice(0, 30)),
      where('moderationStatus', '==', 'approved'),
      limit(800)
    )
  );
  return accumulateLeapInchesByUid(
    snap.docs,
    (cd) => nyLeapWeekStartKeyFromChallengeDate(cd) === weekKey
  );
}

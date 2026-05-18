import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  challengeDateKeysForFirestoreIn,
  normalizeNyDateKey,
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
 * Built as the sum of each leap day in the week (same queries as the Daily tab).
 *
 * A single Firestore query capped at N videos drops most users when the week is busy;
 * one query per day avoids that and matches “weekly = add up each day.”
 */
export async function weeklyLeaderboardFromVideos(weekKey: string): Promise<WeeklyVideoScore[]> {
  const dateKeys = nySundayWeekDateKeys(weekKey);
  if (dateKeys.length === 0) return [];

  const byUid = new Map<string, WeeklyVideoScore>();
  const dayRowsList = await Promise.all(dateKeys.map((dayKey) => leapDayLeaderboardFromVideos(dayKey)));

  for (const dayRows of dayRowsList) {
    for (const row of dayRows) {
      const prev = byUid.get(row.uid);
      if (prev) {
        prev.score = Math.round((prev.score + row.score) * 10) / 10;
        if (!prev.username && row.username) prev.username = row.username;
      } else {
        byUid.set(row.uid, { ...row });
      }
    }
  }

  return Array.from(byUid.values()).filter((r) => r.score > 0);
}

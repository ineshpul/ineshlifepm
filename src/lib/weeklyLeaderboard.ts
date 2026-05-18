import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import { normalizeWeekKey } from './getCurrentWeekKey';
import { weeklyLeapInchesFromUser } from './verticalScore';

export type WeeklyVideoScore = {
  uid: string;
  score: number;
  username: string;
};

const LIST_LIMIT = 100;

/** Users with `leaperWeekKey` / `leaperWeekPoints` for the current leap week. */
export async function weeklyLeaderboardFromUsers(weekKey: string): Promise<WeeklyVideoScore[]> {
  const wk = normalizeNyDateKey(weekKey, '');
  if (!wk) return [];

  const rows: WeeklyVideoScore[] = [];

  try {
    const keyed = await getDocs(
      query(
        collection(firestore(), 'users'),
        where('leaperWeekKey', '==', wk),
        orderBy('leaperWeekPoints', 'desc'),
        limit(LIST_LIMIT)
      )
    );
    keyed.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const score = weeklyLeapInchesFromUser(data, wk);
      if (score <= 0) return;
      rows.push({
        uid: d.id,
        score: Math.round(score * 10) / 10,
        username: String(data.username ?? 'user').trim() || 'user',
      });
    });
  } catch {
    /* index or field missing */
  }

  if (rows.length > 0) return rows;

  try {
    const broad = await getDocs(
      query(collection(firestore(), 'users'), orderBy('leaperWeekPoints', 'desc'), limit(LIST_LIMIT))
    );
    broad.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      const storedKey = normalizeWeekKey(String(data.leaperWeekKey ?? ''));
      if (storedKey && storedKey !== wk) return;
      const score = weeklyLeapInchesFromUser(data, wk);
      if (score <= 0) return;
      rows.push({
        uid: d.id,
        score: Math.round(score * 10) / 10,
        username: String(data.username ?? 'user').trim() || 'user',
      });
    });
  } catch {
    /* ignore */
  }

  return rows;
}

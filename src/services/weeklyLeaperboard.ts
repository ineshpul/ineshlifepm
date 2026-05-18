import { httpsCallable } from 'firebase/functions';

import { weeklyLeaderboardFromUsers, type WeeklyVideoScore } from '../lib/weeklyLeaderboard';
import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

type WeeklyLeaperboardResponse = {
  weekKey: string;
  rows: WeeklyVideoScore[];
};

async function weeklyLeaperboardFromCallable(weekKey: string): Promise<WeeklyVideoScore[]> {
  const fn = httpsCallable<{ weekStartKey?: string }, WeeklyLeaperboardResponse>(
    firebaseFunctions(),
    'getWeeklyLeaperboardCallable'
  );
  const res = await fn({ weekStartKey: weekKey });
  return Array.isArray(res.data?.rows) ? res.data.rows : [];
}

/** Weekly leaperboard from `leaperWeekKey` / `leaperWeekPoints` on user docs only. */
export async function fetchWeeklyLeaperboard(weekKey: string): Promise<WeeklyVideoScore[]> {
  const wk = String(weekKey ?? '').trim();
  if (!wk) return [];

  const sources: WeeklyVideoScore[][] = [];

  if (isFirebaseConfigured()) {
    try {
      sources.push(await weeklyLeaperboardFromCallable(wk));
    } catch {
      /* callable unavailable */
    }
  }

  try {
    sources.push(await weeklyLeaderboardFromUsers(wk));
  } catch {
    /* client query failed */
  }

  const byUid = new Map<string, WeeklyVideoScore>();
  for (const list of sources) {
    for (const row of list) {
      const prev = byUid.get(row.uid);
      if (!prev || row.score > prev.score) {
        byUid.set(row.uid, { ...row });
      }
    }
  }
  return Array.from(byUid.values())
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

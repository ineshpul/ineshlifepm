import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  challengeDateKeysForFirestoreIn,
  nyLeapWeekStartKeyFromChallengeDate,
  nySundayWeekDateKeys,
} from '../utils/nyTime';

export type WeeklyVideoScore = {
  uid: string;
  score: number;
  username: string;
};

/** Sum approved leap inches per user for the NY leap week (Sun noon → next Sun noon). */
export async function weeklyLeaderboardFromVideos(weekKey: string): Promise<WeeklyVideoScore[]> {
  const dateKeys = nySundayWeekDateKeys(weekKey);
  const inKeys = challengeDateKeysForFirestoreIn(dateKeys);
  if (inKeys.length === 0) return [];

  const vq = query(
    collection(firestore(), 'videos'),
    where('challengeDate', 'in', inKeys.slice(0, 30)),
    where('moderationStatus', '==', 'approved'),
    limit(800)
  );
  const snap = await getDocs(vq);
  const byUid = new Map<string, WeeklyVideoScore>();

  snap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (String(data.moderationStatus ?? '') === 'nulled') return;
    const uid = String(data.uid ?? '').trim();
    if (!uid) return;
    const cd = String(data.challengeDate ?? '').trim();
    if (nyLeapWeekStartKeyFromChallengeDate(cd) !== weekKey) return;
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

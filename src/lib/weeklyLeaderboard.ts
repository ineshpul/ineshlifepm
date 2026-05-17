import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  challengeDateKeysForFirestoreIn,
  nySundayWeekDateKeys,
  nySundayWeekStartKey,
} from '../utils/nyTime';

export type WeeklyVideoScore = {
  uid: string;
  score: number;
  username: string;
};

function awardMsFromVideo(data: Record<string, unknown>): number {
  const awarded = data.leapInchesAwardedAt;
  if (awarded && typeof (awarded as { toMillis?: () => number }).toMillis === 'function') {
    return (awarded as { toMillis: () => number }).toMillis();
  }
  const approved = data.approvedAt;
  if (approved && typeof (approved as { toMillis?: () => number }).toMillis === 'function') {
    return (approved as { toMillis: () => number }).toMillis();
  }
  const created = data.createdAt;
  if (created && typeof (created as { toMillis?: () => number }).toMillis === 'function') {
    return (created as { toMillis: () => number }).toMillis();
  }
  return 0;
}

/** Sum approved leap inches per user for the NY Sun–Sat week (award-time week key). */
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
    const ms = awardMsFromVideo(data);
    if (ms > 0 && nySundayWeekStartKey(ms) !== weekKey) return;
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

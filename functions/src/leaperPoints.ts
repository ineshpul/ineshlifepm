import * as admin from 'firebase-admin';
import { nyDateKeyFromMs, nySundayWeekStartKey } from './timeKeys';

const LIKE_PTS = 1;
const COMMENT_PTS = 2;

export async function bumpLeaperPoints(
  db: admin.firestore.Firestore,
  ownerId: string,
  kind: 'like' | 'comment',
  nowMs: number
): Promise<void> {
  if (!ownerId) return;
  const dayKey = nyDateKeyFromMs(nowMs);
  const weekKey = nySundayWeekStartKey(nowMs);
  const inc = kind === 'comment' ? COMMENT_PTS : LIKE_PTS;
  const ref = db.doc(`users/${ownerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const nextDayPoints =
      d.leaperDayKey === dayKey ? Number(d.leaperDayPoints ?? 0) + inc : inc;
    const nextWeekPoints =
      d.leaperWeekKey === weekKey ? Number(d.leaperWeekPoints ?? 0) + inc : inc;
    tx.set(
      ref,
      {
        leaperDayKey: dayKey,
        leaperDayPoints: nextDayPoints,
        leaperWeekKey: weekKey,
        leaperWeekPoints: nextWeekPoints,
      },
      { merge: true }
    );
  });
}

import * as admin from 'firebase-admin';
import { leapChallengeDateKeyFromMs, nySundayWeekStartKey } from './timeKeys';

const LIKE_PTS = 1;
const COMMENT_PTS = 2;
/** One-time bump when a post becomes `approved` so weekly board reflects leaps, not only engagement. */
export const LEAP_APPROVED_PTS = 5;

/** Adds to lifetime total only (e.g. legacy leap credit when event week ≠ current NY week). */
export async function incrementLeaperLifetimePoints(
  db: admin.firestore.Firestore,
  ownerId: string,
  delta: number
): Promise<void> {
  if (!ownerId || !Number.isFinite(delta) || delta === 0) return;
  await db.doc(`users/${ownerId}`).set(
    { leaperLifetimePoints: admin.firestore.FieldValue.increment(delta) },
    { merge: true }
  );
}

export async function bumpLeaperPoints(
  db: admin.firestore.Firestore,
  ownerId: string,
  kind: 'like' | 'comment' | 'leap_approved',
  nowMs: number
): Promise<void> {
  if (!ownerId) return;
  /** Leap challenge day (noon ET→next noon), not NY calendar midnight — matches client `computeFeedViewingFromNow`. */
  const dayKey = leapChallengeDateKeyFromMs(nowMs);
  const weekKey = nySundayWeekStartKey(nowMs);
  const inc =
    kind === 'comment' ? COMMENT_PTS : kind === 'leap_approved' ? LEAP_APPROVED_PTS : LIKE_PTS;
  const ref = db.doc(`users/${ownerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const nextDayPoints =
      d.leaperDayKey === dayKey ? Number(d.leaperDayPoints ?? 0) + inc : inc;
    const nextWeekPoints =
      d.leaperWeekKey === weekKey ? Number(d.leaperWeekPoints ?? 0) + inc : inc;
    const nextLifetime = Number(d.leaperLifetimePoints ?? 0) + inc;
    tx.set(
      ref,
      {
        leaperDayKey: dayKey,
        leaperDayPoints: nextDayPoints,
        leaperWeekKey: weekKey,
        leaperWeekPoints: nextWeekPoints,
        leaperLifetimePoints: nextLifetime,
      },
      { merge: true }
    );
  });
}

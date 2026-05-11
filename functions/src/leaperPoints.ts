import * as admin from 'firebase-admin';
import { leapChallengeDateKeyFromMs, nySundayWeekStartKey } from './timeKeys';

/** Legacy flat bump used by old backfill scripts (not tied to live XP formula). */
export const LEGACY_LEAP_APPROVED_PTS = 5;

/**
 * Adds to `lifetimeVerticalXP`, `leaperLifetimePoints`, and (when award-day matches “now”) day/week board.
 */
export async function incrementLifetimeAndLeaperBoard(
  db: admin.firestore.Firestore,
  ownerId: string,
  delta: number,
  awardMs: number,
  nowMs: number
): Promise<void> {
  if (!ownerId || !Number.isFinite(delta) || delta === 0) return;

  const dayKeyAward = leapChallengeDateKeyFromMs(awardMs);
  const weekKeyAward = nySundayWeekStartKey(awardMs);
  const dayKeyNow = leapChallengeDateKeyFromMs(nowMs);
  const weekKeyNow = nySundayWeekStartKey(nowMs);

  const ref = db.doc(`users/${ownerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};

    const curLife = Math.max(0, Number(d.lifetimeVerticalXP ?? 0));
    const curLeaper = Math.max(0, Number(d.leaperLifetimePoints ?? 0));
    const nextLife = Math.max(0, curLife + delta);
    const nextLeaper = Math.max(0, curLeaper + delta);

    const patch: Record<string, unknown> = {
      lifetimeVerticalXP: nextLife,
      leaperLifetimePoints: nextLeaper,
    };

    if (dayKeyAward === dayKeyNow) {
      const baseDay = d.leaperDayKey === dayKeyNow ? Math.max(0, Number(d.leaperDayPoints ?? 0)) : 0;
      patch.leaperDayKey = dayKeyNow;
      patch.leaperDayPoints = Math.max(0, baseDay + delta);
    }

    if (weekKeyAward === weekKeyNow) {
      const baseWeek = d.leaperWeekKey === weekKeyNow ? Math.max(0, Number(d.leaperWeekPoints ?? 0)) : 0;
      patch.leaperWeekKey = weekKeyNow;
      patch.leaperWeekPoints = Math.max(0, baseWeek + delta);
    }

    tx.set(ref, patch, { merge: true });
  });
}

/** Day/week boards unchanged — totals only (legacy week-boundary backfill). */
export async function incrementLifetimeTotalsOnly(
  db: admin.firestore.Firestore,
  ownerId: string,
  delta: number
): Promise<void> {
  if (!ownerId || !Number.isFinite(delta) || delta === 0) return;
  const ref = db.doc(`users/${ownerId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};
    const curLife = Math.max(0, Number(d.lifetimeVerticalXP ?? 0));
    const curLeaper = Math.max(0, Number(d.leaperLifetimePoints ?? 0));
    tx.set(
      ref,
      {
        lifetimeVerticalXP: Math.max(0, curLife + delta),
        leaperLifetimePoints: Math.max(0, curLeaper + delta),
      },
      { merge: true }
    );
  });
}

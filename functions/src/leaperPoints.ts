import * as admin from 'firebase-admin';
import { leapChallengeDateKeyFromMs } from './timeKeys';
import { getCurrentWeekKey, weekStartKeyFromChallengeDate } from './getCurrentWeekKey';
import { computeWeeklyLeaperFields } from './weeklyLeaperWeek';

/** Build user-doc leaper fields for an inch delta (lifetime, daily, weekly). */
export function buildLeaperPointsPatch(
  stored: Record<string, unknown> | undefined,
  inchDelta: number,
  challengeDayKey: string,
  nowMs: number
): Record<string, unknown> {
  const d = stored ?? {};
  const inch = Math.round(Number(inchDelta ?? 0) * 10) / 10;
  const dayKey = String(challengeDayKey ?? '').trim() || leapChallengeDateKeyFromMs(nowMs);
  const weekKeyNow = getCurrentWeekKey(new Date(nowMs));
  const weekKeyAward = dayKey ? weekStartKeyFromChallengeDate(dayKey) : weekKeyNow;

  const curLife = Math.max(0, Number(d.leaperLifetimePoints ?? 0));
  const nextLife = Math.max(0, Math.round((curLife + inch) * 10) / 10);

  const patch: Record<string, unknown> = {
    leaperLifetimePoints: nextLife,
  };

  if (dayKey) {
    const baseDay = String(d.leaperDayKey ?? '') === dayKey ? Math.max(0, Number(d.leaperDayPoints ?? 0)) : 0;
    patch.leaperDayKey = dayKey;
    patch.leaperDayPoints = Math.max(0, Math.round((baseDay + inch) * 10) / 10);
  }

  const weekly = computeWeeklyLeaperFields(d, weekKeyNow, weekKeyAward, inch);
  patch.leaperWeekKey = weekly.leaperWeekKey;
  patch.leaperWeekPoints = weekly.leaperWeekPoints;
  patch.leaperPriorWeekKey = weekly.leaperPriorWeekKey;
  patch.leaperPriorWeekPoints = weekly.leaperPriorWeekPoints;

  return patch;
}

/**
 * Apply inch deltas to user leaperboard aggregates (all-time, daily, weekly).
 * Weekly reset rolls at Sunday 12:00 PM ET (not calendar midnight).
 */
export async function incrementUserLeapInches(
  db: admin.firestore.Firestore,
  ownerId: string,
  inchDelta: number,
  challengeDayKey: string,
  awardMs: number,
  nowMs: number
): Promise<void> {
  if (!ownerId) return;
  const inch = Math.round(Number(inchDelta ?? 0) * 10) / 10;
  if (inch === 0) return;

  const dayKey = String(challengeDayKey ?? '').trim() || leapChallengeDateKeyFromMs(awardMs);
  const ref = db.doc(`users/${ownerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const patch = buildLeaperPointsPatch(snap.data(), inch, dayKey, nowMs);
    tx.set(ref, patch, { merge: true });
  });
}

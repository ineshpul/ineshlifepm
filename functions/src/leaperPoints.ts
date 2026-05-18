import * as admin from 'firebase-admin';
import {
  leapChallengeDateKeyFromMs,
  nyLeapWeekStartKeyFromChallengeDate,
  nySundayWeekStartKey,
} from './timeKeys';

/**
 * Apply inch deltas to user leaperboard aggregates (all-time, daily, weekly).
 * On NY week boundary, rolls current week into `leaperPriorWeekPoints`.
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
  const weekKeyAward = nyLeapWeekStartKeyFromChallengeDate(dayKey);
  const weekKeyNow = nySundayWeekStartKey(nowMs);

  const ref = db.doc(`users/${ownerId}`);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() ?? {};

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

    const storedWeekKey = String(d.leaperWeekKey ?? '');
    let weekBase = 0;
    if (storedWeekKey === weekKeyNow) {
      weekBase = Math.max(0, Number(d.leaperWeekPoints ?? 0));
    } else if (storedWeekKey && storedWeekKey !== weekKeyNow) {
      patch.leaperPriorWeekPoints = Math.max(0, Number(d.leaperWeekPoints ?? 0));
      patch.leaperPriorWeekKey = storedWeekKey;
      weekBase = 0;
    }
    if (weekKeyAward === weekKeyNow) {
      patch.leaperWeekKey = weekKeyNow;
      patch.leaperWeekPoints = Math.max(0, Math.round((weekBase + inch) * 10) / 10);
    }

    tx.set(ref, patch, { merge: true });
  });
}

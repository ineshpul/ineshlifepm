import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from './timeKeys';

function maxAttemptsFromChallenge(data: admin.firestore.DocumentData | undefined): number {
  const n = Math.round(Number(data?.maxRecordingAttempts ?? 3));
  if (!Number.isFinite(n)) return 3;
  return Math.min(50, Math.max(1, n));
}

export type ResetRecordingAttemptsPageResult = {
  challengeDate: string;
  examined: number;
  reset: number;
  skippedPosted: number;
  skippedAlreadyFresh: number;
  failed: number;
  done: boolean;
  nextCursorId: string | null;
};

/**
 * Resets `postAttempts.used` to 0 for the leap day when the user has not posted a video
 * (`videos/{uid}_{challengeDate}` missing or deleted). Preserves bonus attempts and base reduction.
 */
export async function runResetRecordingAttemptsForLeapDayPage(
  db: admin.firestore.Firestore,
  args: {
    challengeDate: string;
    dryRun: boolean;
    pageSize: number;
    cursorAttemptId?: string;
  }
): Promise<ResetRecordingAttemptsPageResult> {
  const { challengeDate, dryRun } = args;
  const pageSize = Math.min(Math.max(args.pageSize, 1), 400);

  const challengeSnap = await db.doc(`challenges/${challengeDate}`).get();
  const ledgerMax = maxAttemptsFromChallenge(challengeSnap.data());

  let q: admin.firestore.Query = db
    .collection('postAttempts')
    .where('challengeDate', '==', challengeDate)
    .limit(pageSize);

  const cursor = String(args.cursorAttemptId ?? '').trim();
  if (cursor) {
    const cursorSnap = await db.doc(`postAttempts/${cursor}`).get();
    if (cursorSnap.exists) {
      q = q.startAfter(cursorSnap);
    }
  }

  const snap = await q.get();
  let reset = 0;
  let skippedPosted = 0;
  let skippedAlreadyFresh = 0;
  let failed = 0;

  for (const doc of snap.docs) {
    try {
      const data = doc.data();
      const used = Number(data.used ?? 0);
      const bonus = Number(data.bonusRecordingAttempts ?? 0);
      const baseReduction = Number(data.leapBaseReductionInches ?? 0);

      if (used <= 0 && bonus <= 0) {
        skippedAlreadyFresh += 1;
        continue;
      }

      const videoSnap = await db.doc(`videos/${doc.id}`).get();
      if (videoSnap.exists) {
        const vd = videoSnap.data() as { deleted?: boolean; uid?: string } | undefined;
        const owner = String(data.uid ?? doc.id.split('_')[0] ?? '');
        const isActivePost =
          vd?.deleted !== true && String(vd?.uid ?? owner) === owner;
        if (isActivePost) {
          skippedPosted += 1;
          continue;
        }
      }

      if (!dryRun) {
        const patch: Record<string, unknown> = {
          uid: String(data.uid ?? doc.id.split('_')[0] ?? ''),
          challengeDate,
          used: 0,
          max: ledgerMax,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (bonus > 0) {
          patch.bonusRecordingAttempts = bonus;
        }
        if (baseReduction > 0) {
          patch.leapBaseReductionInches = baseReduction;
        }
        await doc.ref.set(patch, { merge: true });
      }
      reset += 1;
    } catch {
      failed += 1;
    }
  }

  const last = snap.docs[snap.docs.length - 1];
  const done = snap.size < pageSize;

  return {
    challengeDate,
    examined: snap.size,
    reset,
    skippedPosted,
    skippedAlreadyFresh,
    failed,
    done,
    nextCursorId: done ? null : last?.id ?? null,
  };
}

export function defaultLeapChallengeDateForReset(nowMs: number): string {
  return leapChallengeDateKeyFromMs(nowMs);
}

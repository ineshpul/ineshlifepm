import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import {
  LEGACY_LEAP_APPROVED_PTS,
  incrementLifetimeAndLeaperBoard,
  incrementLifetimeTotalsOnly,
} from './leaperPoints';
import { nySundayWeekStartKey } from './timeKeys';

export type BackfillLeapLeaperPointsResult = {
  ok: boolean;
  dryRun: boolean;
  creditAllToCurrentNyWeek: boolean;
  thisWeekKey: string;
  examined: number;
  skipped: number;
  backfilled: number;
  lifetimeOnly: number;
  lastVideoId: string;
  nextCursorVideoId: string;
  done: boolean;
};

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export function isEligibleForLeapLeaperBackfill(moderationStatus: unknown): boolean {
  const s = String(moderationStatus ?? '').trim().toLowerCase();
  if (s === 'rejected') return false;
  return true;
}

export async function runBackfillLeapLeaperPointsPage(
  db: admin.firestore.Firestore,
  options: {
    dryRun: boolean;
    creditAllToCurrentNyWeek: boolean;
    pageSize: number;
    cursorVideoId: string;
  }
): Promise<BackfillLeapLeaperPointsResult> {
  const { dryRun, creditAllToCurrentNyWeek, pageSize, cursorVideoId } = options;

  let q = db.collection('videos').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
  if (cursorVideoId) {
    const cursorSnap = await db.doc(`videos/${cursorVideoId}`).get();
    if (cursorSnap.exists) {
      q = q.startAfter(cursorSnap);
    }
  }

  const snap = await q.get();
  const nowMs = Date.now();
  const thisWeekKey = nySundayWeekStartKey(nowMs);

  let examined = 0;
  let skipped = 0;
  let backfilled = 0;
  let lifetimeOnly = 0;
  let lastVideoId = '';

  for (const doc of snap.docs) {
    lastVideoId = doc.id;
    examined += 1;
    const data = doc.data() as Record<string, unknown>;

    if (data.leapLeaperPointsBackfilled === true) {
      skipped += 1;
      continue;
    }

    if (!isEligibleForLeapLeaperBackfill(data.moderationStatus)) {
      skipped += 1;
      continue;
    }

    const owner = String(data.uid ?? '').trim();
    if (!owner) {
      skipped += 1;
      continue;
    }

    const createdMs = toMillis(data.createdAt);
    const eventMs = createdMs > 0 ? createdMs : nowMs;
    const eventWeek = nySundayWeekStartKey(eventMs);

    try {
      if (dryRun) {
        backfilled += 1;
        continue;
      }

      if (creditAllToCurrentNyWeek || eventWeek === thisWeekKey) {
        await incrementLifetimeAndLeaperBoard(db, owner, LEGACY_LEAP_APPROVED_PTS, eventMs, nowMs);
      } else {
        await incrementLifetimeTotalsOnly(db, owner, LEGACY_LEAP_APPROVED_PTS);
        lifetimeOnly += 1;
      }

      await doc.ref.set(
        {
          leapLeaperPointsBackfilled: true,
          leapLeaperPointsBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      backfilled += 1;
    } catch (e) {
      logger.error('backfill leap leaper row failed', { videoId: doc.id, owner, e });
    }
  }

  const done = snap.size < pageSize;

  return {
    ok: true,
    dryRun,
    creditAllToCurrentNyWeek,
    thisWeekKey,
    examined,
    skipped,
    backfilled,
    lifetimeOnly,
    lastVideoId,
    nextCursorVideoId: done ? '' : lastVideoId,
    done,
  };
}

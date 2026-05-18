import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { getCurrentWeekKey } from './getCurrentWeekKey';
import { writeUserWeeklyLeaperFields } from './weeklyLeaperFields';

export type BackfillWeeklyLeaperWeekResult = {
  ok: boolean;
  dryRun: boolean;
  weekKey: string;
  examined: number;
  updated: number;
  failed: number;
  lastUserId: string;
  nextCursorUserId: string;
  done: boolean;
};

/**
 * For every user: sum approved leaps in the current leap week and write
 * `leaperWeekKey` + `leaperWeekPoints` (and prior-week fields for Most Improved).
 */
export async function runBackfillWeeklyLeaperWeekPage(
  db: admin.firestore.Firestore,
  options: {
    dryRun: boolean;
    pageSize: number;
    cursorUserId: string;
  }
): Promise<BackfillWeeklyLeaperWeekResult> {
  const { dryRun, pageSize, cursorUserId } = options;
  const weekKey = getCurrentWeekKey(new Date());

  let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
  if (cursorUserId) {
    const cursorSnap = await db.doc(`users/${cursorUserId}`).get();
    if (cursorSnap.exists) {
      q = q.startAfter(cursorSnap);
    }
  }

  const snap = await q.get();
  let examined = 0;
  let updated = 0;
  let failed = 0;
  let lastUserId = '';

  for (const doc of snap.docs) {
    lastUserId = doc.id;
    examined += 1;
    if (dryRun) {
      updated += 1;
      continue;
    }
    try {
      const patch = await writeUserWeeklyLeaperFields(db, doc.id);
      updated += 1;
      logger.info('weekly leaper fields updated', {
        userId: doc.id,
        weekKey: patch.leaperWeekKey,
        leaperWeekPoints: patch.leaperWeekPoints,
      });
    } catch (e) {
      failed += 1;
      logger.error('backfill weekly leaper week failed', { userId: doc.id, e });
    }
  }

  const done = snap.size < pageSize;

  logger.info('backfill weekly leaper week page', {
    weekKey,
    examined,
    updated,
    failed,
    done,
    lastUserId,
  });

  return {
    ok: true,
    dryRun,
    weekKey,
    examined,
    updated,
    failed,
    lastUserId,
    nextCursorUserId: done ? '' : lastUserId,
    done,
  };
}

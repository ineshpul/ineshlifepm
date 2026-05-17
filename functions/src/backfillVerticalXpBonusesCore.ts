import * as admin from 'firebase-admin';

import { adminRetotalAwardedVideoLeapInches, recomputeUserLeapStatsAdmin } from './verticalScoreRecompute';
import { isAwardedLeapVideo } from './verticalScoreEngine';

const POST_COLLECTION = 'videos';

/** Re-total leap inches on every awarded video for a user page (legacy bonus backfill → inches model). */
export async function runBackfillFirstLeapBonusesUserPage(
  db: admin.firestore.Firestore,
  opts: { cursorUid: string; pageSize: number; dryRun: boolean }
): Promise<{ processed: number; nextCursorUid: string | null; done: boolean; failedUids: string[] }> {
  const pageSize = Math.min(Math.max(opts.pageSize || 25, 1), 60);
  let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
  if (opts.cursorUid) {
    const cur = await db.doc(`users/${opts.cursorUid}`).get();
    if (cur.exists) q = q.startAfter(cur);
  }
  const snap = await q.get();
  const failedUids: string[] = [];
  let processed = 0;

  for (const udoc of snap.docs) {
    const uid = udoc.id;
    try {
      if (!opts.dryRun) {
        const vids = await db.collection(POST_COLLECTION).where('uid', '==', uid).limit(120).get();
        for (const vd of vids.docs) {
          const data = vd.data() as Record<string, unknown>;
          if (isAwardedLeapVideo(data)) {
            await adminRetotalAwardedVideoLeapInches(db, vd.id);
          }
        }
        await recomputeUserLeapStatsAdmin(uid);
      }
      processed += 1;
    } catch {
      failedUids.push(uid);
    }
  }

  const lastUid = snap.empty ? null : snap.docs[snap.docs.length - 1]?.id ?? null;
  return { processed, nextCursorUid: lastUid, done: snap.size < pageSize, failedUids };
}

/** @deprecated Day-winner stats unused in inches model; no-op page for callable compatibility. */
export async function runBackfillFirstPostOfDayStatsPage(
  _db: admin.firestore.Firestore,
  opts: { cursorDayKey: string; dayKeys: string[]; dryRun: boolean }
): Promise<{ processed: number; nextCursorDayKey: string | null; done: boolean }> {
  const keys = opts.dayKeys ?? [];
  return { processed: keys.length, nextCursorDayKey: null, done: true };
}

export async function runBackfillFirstPostOfDayForDayKeys(
  db: admin.firestore.Firestore,
  dayKeys: string[],
  opts: { dryRun: boolean; overwriteStats?: boolean }
): Promise<{ processed: number }> {
  return runBackfillFirstPostOfDayStatsPage(db, {
    cursorDayKey: '',
    dayKeys,
    dryRun: opts.dryRun,
  });
}

export function defaultDayKeysForBonusBackfill(nowMs: number, spanDays: number): string[] {
  const span = Math.min(Math.max(spanDays, 1), 120);
  const keys: string[] = [];
  for (let i = 0; i < span; i++) {
    keys.push(String(nowMs - i * 86400000));
  }
  return keys;
}

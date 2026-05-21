import * as admin from 'firebase-admin';
import type { Firestore } from 'firebase-admin/firestore';

import {
  latestVideoIdentityForUser,
  syncUserIdentityFromVideo,
  userNeedsIdentitySync,
} from './syncUserIdentityFromVideo';

export type BackfillUserIdentityPageResult = {
  examined: number;
  updated: number;
  skipped: number;
  failed: number;
  failedUids: string[];
  nextCursorUserId: string | null;
  done: boolean;
};

export async function runBackfillUserIdentityFromVideosPage(
  db: Firestore,
  args: { dryRun?: boolean; pageSize?: number; cursorUserId?: string }
): Promise<BackfillUserIdentityPageResult> {
  const dryRun = Boolean(args.dryRun);
  const pageSize = Math.min(Math.max(Number(args.pageSize) || 40, 1), 100);
  const cursorUserId = String(args.cursorUserId ?? '').trim();

  let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
  if (cursorUserId) {
    const cur = await db.doc(`users/${cursorUserId}`).get();
    if (cur.exists) q = q.startAfter(cur);
  }

  const snap = await q.get();
  let examined = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failedUids: string[] = [];

  for (const d of snap.docs) {
    examined += 1;
    const data = d.data() as Record<string, unknown>;
    if (!userNeedsIdentitySync(data)) {
      skipped += 1;
      continue;
    }

    try {
      const videoData = await latestVideoIdentityForUser(db, d.id);
      if (!videoData) {
        skipped += 1;
        continue;
      }
      if (dryRun) {
        updated += 1;
        continue;
      }
      const r = await syncUserIdentityFromVideo(db, d.id, videoData);
      if (r.updated) updated += 1;
      else skipped += 1;
    } catch {
      failed += 1;
      failedUids.push(d.id);
    }
  }

  const lastUid = snap.empty ? null : snap.docs[snap.docs.length - 1]?.id ?? null;
  return {
    examined,
    updated,
    skipped,
    failed,
    failedUids,
    nextCursorUserId: lastUid,
    done: snap.size < pageSize,
  };
}

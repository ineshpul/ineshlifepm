/**
 * Recompute Vertical Score + daily leaper points for every user (May 12 rules).
 *
 * Prerequisites:
 *   cd functions && npm run build
 *
 * Auth:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   or gcloud auth application-default login
 *
 * Usage:
 *   npm run recompute:all
 *   PAGE_SIZE=30 npm run recompute:all
 */

import * as admin from 'firebase-admin';

import { recomputeVerticalScoreAdmin } from './verticalScoreRecompute';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

async function main(): Promise<void> {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const pageSize = Math.min(Math.max(parseInt(process.env.PAGE_SIZE ?? '25', 10) || 25, 1), 50);
  let cursorUid = '';
  let page = 0;
  let processed = 0;
  let failed = 0;
  const failedUids: string[] = [];

  for (;;) {
    page += 1;
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (cursorUid) {
      const cur = await db.doc(`users/${cursorUid}`).get();
      if (cur.exists) q = q.startAfter(cur);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      const uid = d.id;
      try {
        await recomputeVerticalScoreAdmin(uid);
        processed += 1;
      } catch (e) {
        failed += 1;
        failedUids.push(uid);
        // eslint-disable-next-line no-console
        console.error(JSON.stringify({ uid, error: String(e) }));
      }
    }

    cursorUid = snap.docs[snap.docs.length - 1]?.id ?? '';
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        page,
        batch: snap.size,
        processed,
        failed,
        lastUid: cursorUid,
        done: snap.size < pageSize,
      })
    );

    if (snap.size < pageSize) break;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      finished: true,
      processed,
      failed,
      failedUids: failedUids.slice(0, 50),
    })
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

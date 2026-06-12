/**
 * One-off: rebuild videos.likesCount from each likes subcollection.
 * Usage (from repo root): npx ts-node --project functions/tsconfig.json functions/src/scripts/backfillLikesCountOnce.ts
 */
import * as admin from 'firebase-admin';

admin.initializeApp({ projectId: 'leap-e4cce' });

const PAGE_SIZE = 100;

async function main(): Promise<void> {
  const db = admin.firestore();
  const dryRun = process.argv.includes('--dry-run');
  let cursorId = '';
  let processed = 0;
  let updated = 0;

  for (;;) {
    let q = db.collection('videos').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursorId) {
      const cur = await db.doc(`videos/${cursorId}`).get();
      if (cur.exists) q = q.startAfter(cur);
    }

    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      processed += 1;
      const stored = Number(d.data()?.likesCount ?? NaN);
      const agg = await d.ref.collection('likes').count().get();
      const actual = Math.max(0, agg.data().count);
      if (!Number.isFinite(stored) || stored !== actual) {
        updated += 1;
        if (!dryRun) {
          await d.ref.update({ likesCount: actual });
        }
        console.log(`${dryRun ? '[dry-run] ' : ''}${d.id}: ${stored} → ${actual}`);
      }
    }

    cursorId = snap.docs[snap.docs.length - 1]?.id ?? '';
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`Done. processed=${processed} updated=${updated} dryRun=${dryRun}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

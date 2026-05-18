/**
 * Force-recompute weekly leaper fields for every user.
 *
 *   cd functions && npm run build
 *   npm run backfill:weekly
 */

import * as admin from 'firebase-admin';

import { runBackfillWeeklyLeaperWeekPage } from './backfillWeeklyLeaperWeekCore';

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

  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  const pageSize = Math.min(
    Math.max(parseInt(process.env.PAGE_SIZE ?? '80', 10) || 80, 1),
    200
  );

  let cursor = '';
  let totalExamined = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let page = 0;
  let weekKey = '';

  for (;;) {
    page += 1;
    const r = await runBackfillWeeklyLeaperWeekPage(db, {
      dryRun,
      pageSize,
      cursorUserId: cursor,
    });
    weekKey = r.weekKey;
    totalExamined += r.examined;
    totalUpdated += r.updated;
    totalFailed += r.failed;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ page, ...r }));

    if (r.done) break;
    if (!r.nextCursorUserId) break;
    cursor = r.nextCursorUserId;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      finished: true,
      dryRun,
      weekKey,
      totalExamined,
      totalUpdated,
      totalFailed,
      pages: page,
    })
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

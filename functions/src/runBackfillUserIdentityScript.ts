/**
 * Sync usernames onto `users/{uid}` from each user's latest leap (fixes leaperboard "Anonymous").
 *
 *   cd functions && npm run build
 *   npm run backfill:identity
 *
 * Dry run: DRY_RUN=1 npm run backfill:identity
 */

import * as admin from 'firebase-admin';

import { runBackfillUserIdentityFromVideosPage } from './backfillUserIdentityFromVideosCore';

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
    Math.max(parseInt(process.env.PAGE_SIZE ?? '50', 10) || 50, 1),
    100
  );

  let cursor = '';
  let totalExamined = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let page = 0;

  for (;;) {
    page += 1;
    const r = await runBackfillUserIdentityFromVideosPage(db, {
      dryRun,
      pageSize,
      cursorUserId: cursor,
    });
    totalExamined += r.examined;
    totalUpdated += r.updated;
    totalSkipped += r.skipped;
    totalFailed += r.failed;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ page, dryRun, ...r }));

    if (r.done) break;
    if (!r.nextCursorUserId) break;
    cursor = r.nextCursorUserId;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      finished: true,
      dryRun,
      totalExamined,
      totalUpdated,
      totalSkipped,
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

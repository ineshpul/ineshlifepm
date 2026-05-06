/**
 * Runs the leap leaper backfill until all video docs are processed.
 *
 * Prerequisites:
 *   cd functions && npm run build
 *
 * Auth (pick one):
 *   - Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON with Firestore access.
 *   - Or run `gcloud auth application-default login` as a project user with appropriate roles.
 *
 * Usage:
 *   node lib/runBackfillLeapLeaperPointsScript.js
 *   DRY_RUN=1 node lib/runBackfillLeapLeaperPointsScript.js
 *   CREDIT_EVENT_WEEK_ONLY=1 node lib/runBackfillLeapLeaperPointsScript.js   (disables crediting all to current NY week)
 */

import * as admin from 'firebase-admin';

import { runBackfillLeapLeaperPointsPage } from './backfillLeapLeaperPointsCore';

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
  const creditAllToCurrentNyWeek =
    process.env.CREDIT_EVENT_WEEK_ONLY !== '1' && process.env.CREDIT_EVENT_WEEK_ONLY !== 'true';
  const pageSize = Math.min(
    Math.max(parseInt(process.env.PAGE_SIZE ?? '120', 10) || 120, 1),
    300
  );

  let cursor = '';
  let totalBackfilled = 0;
  let totalLifetime = 0;
  let page = 0;

  for (;;) {
    page += 1;
    const r = await runBackfillLeapLeaperPointsPage(db, {
      dryRun,
      creditAllToCurrentNyWeek,
      pageSize,
      cursorVideoId: cursor,
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        page,
        ...r,
      })
    );

    totalBackfilled += r.backfilled;
    totalLifetime += r.lifetimeOnly;

    if (r.done) break;
    if (!r.nextCursorVideoId) break;
    cursor = r.nextCursorVideoId;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      finished: true,
      dryRun,
      creditAllToCurrentNyWeek,
      totalBackfilled,
      totalLifetimeOnly: totalLifetime,
    })
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

/**
 * Fix everyone stuck after delete: remove soft-deleted today's videos + reset postAttempts
 * for users with no active post (fixes "You already posted today" + out of attempts).
 *
 *   cd functions
 *   npm run heal:leap-day
 *
 * Dry run:  $env:DRY_RUN = "1"; npm run heal:leap-day
 * Date:     $env:CHALLENGE_DATE = "2026-06-03"; npm run heal:leap-day
 */

import * as admin from 'firebase-admin';

import { healLeapDayPostAndAttempts } from './healLeapDayPostAndAttemptsCore';

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
  const challengeDate = String(process.env.CHALLENGE_DATE ?? '').trim() || undefined;

  const result = await healLeapDayPostAndAttempts(db, { challengeDate, dryRun });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ finished: true, ...result }, null, 2));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

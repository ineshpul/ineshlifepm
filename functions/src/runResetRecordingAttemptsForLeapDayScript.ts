/**
 * Reset recording attempts for the active leap day (users without a posted video).
 *
 *   cd functions && npm run build
 *   npm run reset:recording-attempts
 *
 * Dry run: DRY_RUN=1 npm run reset:recording-attempts
 * Date override: CHALLENGE_DATE=2026-05-28 npm run reset:recording-attempts
 */

import * as admin from 'firebase-admin';

import {
  defaultLeapChallengeDateForReset,
  runResetRecordingAttemptsForLeapDayPage,
} from './resetRecordingAttemptsForLeapDayCore';

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
  const challengeDate =
    String(process.env.CHALLENGE_DATE ?? '').trim() || defaultLeapChallengeDateForReset(Date.now());
  const pageSize = Math.min(
    Math.max(parseInt(process.env.PAGE_SIZE ?? '200', 10) || 200, 1),
    400
  );

  let cursor = '';
  let totalExamined = 0;
  let totalReset = 0;
  let totalSkippedPosted = 0;
  let totalSkippedFresh = 0;
  let totalFailed = 0;
  let page = 0;

  for (;;) {
    page += 1;
    const r = await runResetRecordingAttemptsForLeapDayPage(db, {
      challengeDate,
      dryRun,
      pageSize,
      cursorAttemptId: cursor || undefined,
    });
    totalExamined += r.examined;
    totalReset += r.reset;
    totalSkippedPosted += r.skippedPosted;
    totalSkippedFresh += r.skippedAlreadyFresh;
    totalFailed += r.failed;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ page, ...r }));

    if (r.done) break;
    if (!r.nextCursorId) break;
    cursor = r.nextCursorId;
  }

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      finished: true,
      dryRun,
      challengeDate,
      totalExamined,
      totalReset,
      totalSkippedPosted,
      totalSkippedFresh,
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

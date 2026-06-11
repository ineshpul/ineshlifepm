/**
 * Repair global first-post stats for a leap day and retotal awarded videos.
 *
 *   cd functions && npm run build
 *   DAY_KEY=2026-05-19 npm run heal:first-post
 */

import * as admin from 'firebase-admin';

import { healGlobalFirstPostStatsForDay } from './leapDayFirstPost';
import {
  retotalAllAwardedVideosForLeapDay,
  settleApprovedLeapInchesForLeapDay,
} from './verticalScoreRecompute';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

async function main(): Promise<void> {
  const dayKey = String(process.env.DAY_KEY ?? '').trim();
  if (!dayKey) {
    throw new Error('Set DAY_KEY (YYYY-MM-DD leap day, e.g. 2026-05-19).');
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();

  const { newFirstVideoId } = await healGlobalFirstPostStatsForDay(db, dayKey);
  const settledVideoIds = await settleApprovedLeapInchesForLeapDay(db, dayKey);
  const retotaledVideoIds = await retotalAllAwardedVideosForLeapDay(db, dayKey);

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      finished: true,
      dayKey,
      newFirstVideoId,
      settledCount: settledVideoIds.length,
      retotaledCount: retotaledVideoIds.length,
    })
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { uploadChallengePostStatsExport } from './exportChallengePostStatsCore';
import { getDayKey } from './leapDayKey';

const REGION = 'us-central1';

/** Leap day ends at noon ET — export finalized stats ~5 min after rollover. */
const SCHEDULE_OPTS = {
  region: REGION,
  timeZone: 'America/New_York',
  memory: '512MiB' as const,
  timeoutSeconds: 540,
  schedule: '5 12 * * *',
};

export async function runChallengePostStatsExport(nowMs: number = Date.now()): Promise<void> {
  const db = admin.firestore();
  const auth = admin.auth();

  const closedLeapDayKey = getDayKey('America/New_York', nowMs - 60 * 60 * 1000);

  const result = await uploadChallengePostStatsExport(db, auth, {
    reconcileDayKey: closedLeapDayKey,
    closedLeapDayKey,
  });

  logger.info('scheduledChallengePostStatsExport finished', {
    closedLeapDayKey,
    ...result,
  });
}

export const scheduledChallengePostStatsExport = onSchedule(SCHEDULE_OPTS, async () => {
  try {
    await runChallengePostStatsExport();
  } catch (e) {
    logger.error('scheduledChallengePostStatsExport failed', e);
  }
});

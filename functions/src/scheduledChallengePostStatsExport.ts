import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { uploadChallengePostStatsExport } from './exportChallengePostStatsCore';
import { nyDateKeyFromMs } from './timeKeys';

const REGION = 'us-central1';

/** Finalize yesterday's stats at 12:05 AM ET (calendar day boundary). */
const SCHEDULE_OPTS = {
  region: REGION,
  timeZone: 'America/New_York',
  memory: '512MiB' as const,
  timeoutSeconds: 540,
  schedule: '5 0 * * *',
};

function previousCalendarDayKey(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return dateKey;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - 24 * 3600000;
  return nyDateKeyFromMs(t);
}

export async function runChallengePostStatsExport(nowMs: number = Date.now()): Promise<void> {
  const db = admin.firestore();
  const auth = admin.auth();

  const openCalendarDayKey = nyDateKeyFromMs(nowMs);
  const closedCalendarDayKey = previousCalendarDayKey(openCalendarDayKey);

  const result = await uploadChallengePostStatsExport(db, auth, {
    reconcileDayKey: closedCalendarDayKey,
    closedCalendarDayKey,
    nowMs,
  });

  logger.info('scheduledChallengePostStatsExport finished', {
    closedCalendarDayKey,
    dayCount: result.dayCount,
    totalPosts: result.totalPosts,
    openCalendarDayKey: result.openCalendarDayKey,
  });
}

export const scheduledChallengePostStatsExport = onSchedule(SCHEDULE_OPTS, async () => {
  try {
    await runChallengePostStatsExport();
  } catch (e) {
    logger.error('scheduledChallengePostStatsExport failed', e);
  }
});

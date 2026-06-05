import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs, nyDateKeyFromMs } from './timeKeys';
import {
  getCurrentWeekKey,
  leapWeekChallengeDateKeys as nyLeapWeekChallengeDateKeys,
} from './getCurrentWeekKey';

const REGION = 'us-central1';

/**
 * Keeps `config/leapViewing` in sync with app `computeFeedViewingFromNow` so security rules can
 * enforce “must have posted for the active noon→noon cycle” for reading others’ videos.
 */
export const scheduledLeapViewingMeta = onSchedule(
  {
    /** Every 5 min is enough for noon ET day rollover; avoids ~43k runs/month at * * * * *. */
    schedule: '*/5 * * * *',
    region: REGION,
    timeZone: 'America/New_York',
    memory: '256MiB',
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const viewingChallengeDateKey = leapChallengeDateKeyFromMs(now);
    /** NY calendar “today” — used with viewingChallengeDateKey so rules can match legacy/calendar-keyed posts. */
    const nyCalendarDateKey = nyDateKeyFromMs(now);
    const leapWeekStartKey = getCurrentWeekKey(new Date(now));
    const leapWeekChallengeDateKeys = nyLeapWeekChallengeDateKeys(leapWeekStartKey);

    const ref = db.doc('config/leapViewing');
    const prev = await ref.get();
    const p = prev.data() ?? {};
    const unchanged =
      prev.exists &&
      String(p.viewingChallengeDateKey ?? '') === viewingChallengeDateKey &&
      String(p.nyCalendarDateKey ?? '') === nyCalendarDateKey &&
      String(p.leapWeekStartKey ?? '') === leapWeekStartKey &&
      JSON.stringify(p.leapWeekChallengeDateKeys ?? []) === JSON.stringify(leapWeekChallengeDateKeys);
    if (unchanged) return;

    try {
      await ref.set(
        {
          viewingChallengeDateKey,
          nyCalendarDateKey,
          leapWeekStartKey,
          leapWeekChallengeDateKeys,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      logger.error('scheduledLeapViewingMeta failed', e);
    }
  }
);

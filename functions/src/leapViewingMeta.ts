import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs, nyDateKeyFromMs } from './timeKeys';

const REGION = 'us-central1';

/**
 * Keeps `config/leapViewing` in sync with app `computeFeedViewingFromNow` so security rules can
 * enforce “must have posted for the active noon→noon cycle” for reading others’ videos.
 */
export const scheduledLeapViewingMeta = onSchedule(
  {
    schedule: '* * * * *',
    region: REGION,
    timeZone: 'America/New_York',
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const viewingChallengeDateKey = leapChallengeDateKeyFromMs(now);
    /** NY calendar “today” — used with viewingChallengeDateKey so rules can match legacy/calendar-keyed posts. */
    const nyCalendarDateKey = nyDateKeyFromMs(now);
    try {
      await db.doc('config/leapViewing').set(
        {
          viewingChallengeDateKey,
          nyCalendarDateKey,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      logger.error('scheduledLeapViewingMeta failed', e);
    }
  }
);

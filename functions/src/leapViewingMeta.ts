import * as logger from 'firebase-functions/logger';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';

import { leapChallengeDateKeyFromMs } from './timeKeys';

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
    const viewingChallengeDateKey = leapChallengeDateKeyFromMs(Date.now());
    try {
      await db.doc('config/leapViewing').set(
        {
          viewingChallengeDateKey,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (e) {
      logger.error('scheduledLeapViewingMeta failed', e);
    }
  }
);

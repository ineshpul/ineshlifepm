import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { recomputeVerticalScoreAdmin } from './verticalScoreRecompute';
import type { VerticalScoreBreakdownFirestore } from './verticalScoreTypes';

const REGION = 'us-central1';

const EMPTY_BREAKDOWN: VerticalScoreBreakdownFirestore = {
  lifetimePower: 0,
  streakPower: 0,
  recentQualityPower: 0,
  inactivityDecay: 0,
  safetyPenalty: 0,
  lifetimeVerticalXP: 0,
  activeLeapStreakDays: 0,
  recentQualityAvg: 0,
};

/**
 * Authenticated users may recompute their own Vertical Score only (admin SDK write).
 */
export const recomputeVerticalScoreCallable = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  await recomputeVerticalScoreAdmin(uid);
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  const data = snap.data() ?? {};
  const raw = data.verticalScoreBreakdown;
  let verticalScoreBreakdown: VerticalScoreBreakdownFirestore = { ...EMPTY_BREAKDOWN };
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    if ('lifetimePower' in o || 'recentQualityAvg' in o) {
      verticalScoreBreakdown = {
        lifetimePower: Number(o.lifetimePower ?? 0),
        streakPower: Number(o.streakPower ?? 0),
        recentQualityPower: Number(o.recentQualityPower ?? 0),
        inactivityDecay: Number(o.inactivityDecay ?? 0),
        safetyPenalty: Number(o.safetyPenalty ?? 0),
        lifetimeVerticalXP: Number(o.lifetimeVerticalXP ?? 0),
        activeLeapStreakDays: Number(o.activeLeapStreakDays ?? 0),
        recentQualityAvg: Number(o.recentQualityAvg ?? 0),
      };
    }
  }
  return {
    verticalScore: Number(data.verticalScore ?? 0),
    verticalScoreBreakdown,
  };
});

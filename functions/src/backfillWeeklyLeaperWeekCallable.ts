import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { runBackfillWeeklyLeaperWeekPage } from './backfillWeeklyLeaperWeekCore';
import { getCurrentWeekKey, normalizeWeekKey } from './getCurrentWeekKey';


async function sampleUserWeekKeys(
  db: admin.firestore.Firestore,
  expectedWeekKey: string
): Promise<
  { uid: string; leaperWeekKey: string; leaperWeekPoints: number; matches: boolean }[]
> {
  const snap = await db.collection('users').orderBy('leaperWeekPoints', 'desc').limit(20).get();
  return snap.docs
    .filter((d) => Number(d.data().leaperWeekPoints ?? 0) > 0)
    .slice(0, 3)
    .map((d) => {
      const raw = String(d.data().leaperWeekKey ?? '');
      const key = normalizeWeekKey(raw);
      return {
        uid: d.id,
        leaperWeekKey: key || raw,
        leaperWeekPoints: Number(d.data().leaperWeekPoints ?? 0),
        matches: key === expectedWeekKey,
      };
    });
}

/**
 * Admin-only: align all users' weekly leaper fields with Sunday noon ET boundaries.
 * Paginate with `cursorUserId` until `done` is true.
 */
export const backfillWeeklyLeaperWeekCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const dryRun = Boolean(request.data?.dryRun);
  const pageSize = Math.min(Math.max(Number(request.data?.limit) || 50, 1), 200);
  const cursorUserId = String(request.data?.cursorUserId ?? '').trim();

  const currentWeekKey = getCurrentWeekKey(new Date(), 'America/New_York');
  logger.info('backfillWeeklyLeaperWeekCallable currentWeekKey', { currentWeekKey });

  const result = await runBackfillWeeklyLeaperWeekPage(db, { dryRun, pageSize, cursorUserId });

  const sampleUsers =
    result.done && !dryRun ? await sampleUserWeekKeys(db, currentWeekKey) : [];

  if (result.done) {
    logger.info('backfillWeeklyLeaperWeekCallable finished', {
      currentWeekKey,
      sampleUsers,
      ...result,
    });
  }

  return {
    ...result,
    currentWeekKey,
    sampleUsers,
  };
});

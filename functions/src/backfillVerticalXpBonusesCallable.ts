import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import {
  defaultDayKeysForBonusBackfill,
  runBackfillFirstLeapBonusesUserPage,
  runBackfillFirstPostOfDayForDayKeys,
} from './backfillVerticalXpBonusesCore';


/**
 * Admin-only: idempotent backfill for `firstLeapBonusXP` (per user) and/or `firstPostOfDayBonusXP` (per day).
 * - `mode`: `firstLeap` | `firstPost` | `all`
 * - `firstLeap`: pass `cursorUid` / `limit` and repeat until `done`
 * - `firstPost`: pass `dayKeys` (string[]) or omit to use generated keys; `overwriteStats` default false
 */
export const backfillVerticalXpBonusesCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const rawMode = String(request.data?.mode ?? 'all').trim().toLowerCase();
  const normalized =
    rawMode === 'firstleap' || rawMode === 'first_leap'
      ? 'firstLeap'
      : rawMode === 'firstpost' || rawMode === 'first_post'
        ? 'firstPost'
        : rawMode === 'all'
          ? 'all'
          : null;
  if (!normalized) {
    throw new HttpsError('invalid-argument', 'mode must be firstLeap, firstPost, or all.');
  }

  const dryRun = Boolean(request.data?.dryRun);
  const overwriteStats = Boolean(request.data?.overwriteStats);

  const out: Record<string, unknown> = { dryRun, mode: normalized };

  if (normalized === 'firstLeap' || normalized === 'all') {
    const pageSize = Math.min(Math.max(Number(request.data?.limit) || 25, 1), 60);
    const cursorUid = String(request.data?.cursorUid ?? '').trim();
    const r = await runBackfillFirstLeapBonusesUserPage(db, { cursorUid, pageSize, dryRun });
    out.firstLeap = r;
  }

  if (normalized === 'firstPost' || normalized === 'all') {
    const rawKeys = request.data?.dayKeys;
    const dayKeys = Array.isArray(rawKeys)
      ? rawKeys.map((k: unknown) => String(k ?? '').trim()).filter(Boolean)
      : defaultDayKeysForBonusBackfill(Date.now(), Number(request.data?.spanDays) || 42);
    const r = await runBackfillFirstPostOfDayForDayKeys(db, dayKeys, { dryRun, overwriteStats });
    out.firstPostOfDay = r;
  }

  return out;
});

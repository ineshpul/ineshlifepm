import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { recomputeVerticalScoreAdmin } from './verticalScoreRecompute';


/**
 * Admin-only: pages through `users` by document id and runs `recomputeVerticalScoreAdmin` per uid.
 * Call repeatedly with `cursorUid` from the previous response until `done` is true.
 * Safe for old users (missing fields are derived inside recompute).
 */
export const backfillVerticalScoresCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const db = admin.firestore();
  const me = await db.doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const pageSize = Math.min(Math.max(Number(request.data?.limit) || 20, 1), 40);
  const cursorUid = String(request.data?.cursorUid ?? '').trim();

  let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
  if (cursorUid) {
    const cur = await db.doc(`users/${cursorUid}`).get();
    if (cur.exists) q = q.startAfter(cur);
  }

  const snap = await q.get();
  const failedUids: string[] = [];
  let processed = 0;

  for (const d of snap.docs) {
    try {
      await recomputeVerticalScoreAdmin(d.id);
      processed += 1;
    } catch {
      failedUids.push(d.id);
    }
  }

  const lastUid = snap.empty ? null : snap.docs[snap.docs.length - 1]?.id ?? null;
  return {
    processed,
    failedUids,
    nextCursorUid: lastUid,
    done: snap.size < pageSize,
  };
});

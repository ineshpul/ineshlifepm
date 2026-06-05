import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { recomputeVerticalScoreAdmin } from './verticalScoreRecompute';

const REGION = 'us-central1';
const PAGE_SIZE = 25;
const MAX_PAGES = 400;

async function assertAdmin(callerUid: string): Promise<void> {
  const me = await admin.firestore().doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
}

/**
 * Admin-only: recomputes leap stats for every user (inches model, Sun–Sat week keys, streaks).
 * Runs all pages in one invocation (up to ~9 min). Prefer for one-tap backfill from the app.
 */
export const backfillAllVerticalScoresOnceCallable = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
    await assertAdmin(callerUid);

    try {
    const db = admin.firestore();
    let cursorUid = '';
    let processed = 0;
    const failedUids: string[] = [];
    let pages = 0;

    for (;;) {
      pages += 1;
      if (pages > MAX_PAGES) break;

      let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
      if (cursorUid) {
        const cur = await db.doc(`users/${cursorUid}`).get();
        if (cur.exists) q = q.startAfter(cur);
      }

      const snap = await q.get();
      if (snap.empty) break;

      for (const d of snap.docs) {
        try {
          await recomputeVerticalScoreAdmin(d.id);
          processed += 1;
        } catch {
          failedUids.push(d.id);
        }
      }

      cursorUid = snap.docs[snap.docs.length - 1]?.id ?? '';
      if (snap.size < PAGE_SIZE) break;
    }

    return {
      processed,
      failedCount: failedUids.length,
      failedUids: failedUids.slice(0, 40),
      pages,
      done: pages <= MAX_PAGES,
    };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpsError('internal', msg || 'Backfill failed.');
    }
  }
);

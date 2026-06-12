import { CALLABLE_OPTIONS } from './callableOptions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { syncLikesCountForVideo } from './likeEngagement';

const PAGE_SIZE = 100;
const MAX_PAGES = 500;

async function assertAdmin(callerUid: string): Promise<void> {
  const me = await admin.firestore().doc(`users/${callerUid}`).get();
  if (!me.exists || me.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }
}

/**
 * Admin-only: rebuild `videos/{id}.likesCount` from each video's `likes` subcollection.
 * Run once after deploy so the feed shows correct counts immediately (1.0.1-style snappiness).
 */
export const backfillLikesCountCallable = onCall(
  { ...CALLABLE_OPTIONS, timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Sign in required.');
    await assertAdmin(callerUid);

    const dryRun = Boolean(request.data?.dryRun);
    const db = admin.firestore();
    let cursorId = '';
    let processed = 0;
    let updated = 0;
    let pages = 0;

    for (;;) {
      pages += 1;
      if (pages > MAX_PAGES) break;

      let q = db
        .collection('videos')
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (cursorId) {
        const cur = await db.doc(`videos/${cursorId}`).get();
        if (cur.exists) q = q.startAfter(cur);
      }

      const snap = await q.get();
      if (snap.empty) break;

      for (const d of snap.docs) {
        processed += 1;
        const stored = Number(d.data()?.likesCount ?? NaN);
        const agg = await d.ref.collection('likes').count().get();
        const actual = Math.max(0, agg.data().count);
        if (!Number.isFinite(stored) || stored !== actual) {
          updated += 1;
          if (!dryRun) {
            await syncLikesCountForVideo(db, d.id);
          }
        }
      }

      cursorId = snap.docs[snap.docs.length - 1]?.id ?? '';
      if (snap.size < PAGE_SIZE) break;
    }

    logger.info('backfillLikesCount', { processed, updated, dryRun, pages });
    return { processed, updated, dryRun, pages };
  }
);

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { CALLABLE_OPTIONS } from './callableOptions';

const VIEW_THROTTLE_MS = 6 * 60 * 60 * 1000;
const ADMIN_NOTIFY_EVERY = 25;

/** Server-only counter — kept off the main video doc so feed listeners don't re-fire on every view. */
function viewStatsRef(videoRef: admin.firestore.DocumentReference) {
  return videoRef.collection('private').doc('stats');
}

async function readViewCount(
  videoRef: admin.firestore.DocumentReference,
  legacyData?: Record<string, unknown>
): Promise<number> {
  const statsSnap = await viewStatsRef(videoRef).get();
  if (statsSnap.exists) {
    const n = Number(statsSnap.data()?.viewCount ?? 0);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const legacy = Number(legacyData?.viewCount ?? 0);
  return Number.isFinite(legacy) && legacy >= 0 ? legacy : 0;
}

/**
 * Counts a single authenticated view per viewer per video, throttled server-side.
 * Writes a milestone row to each admin inbox (server-side) on coarse view counts.
 */
export const recordVideoViewCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const videoId = String(request.data?.videoId ?? '').trim();
  if (!videoId) throw new HttpsError('invalid-argument', 'videoId is required.');

  const db = admin.firestore();
  const vref = db.doc(`videos/${videoId}`);

  const pre = await vref.get();
  if (!pre.exists) throw new HttpsError('not-found', 'Video not found.');
  const preData = pre.data() as Record<string, unknown>;
  const owner = String(preData.uid ?? '');
  if (!owner || owner === uid) {
    return { ok: true, viewCount: await readViewCount(vref, preData) };
  }

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(vref);
    if (!snap.exists) return;
    const d = snap.data() as Record<string, unknown>;
    const o = String(d.uid ?? '');
    if (!o || o === uid) return;

    const markRef = vref.collection('viewMarks').doc(uid);
    const markSnap = await tx.get(markRef);
    const now = Date.now();
    if (markSnap.exists) {
      const prev = (markSnap.data() as { at?: { toMillis?: () => number } })?.at;
      const prevMs = prev?.toMillis?.() ?? 0;
      if (prevMs && now - prevMs < VIEW_THROTTLE_MS) return;
    }

    const statsRef = viewStatsRef(vref);
    const statsSnap = await tx.get(statsRef);
    const legacyCount = Number(d.viewCount ?? 0);
    if (!statsSnap.exists && Number.isFinite(legacyCount) && legacyCount > 0) {
      tx.set(statsRef, { viewCount: legacyCount }, { merge: true });
    }

    tx.set(markRef, { at: admin.firestore.FieldValue.serverTimestamp() });
    tx.set(statsRef, { viewCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
  });

  const newViewCount = await readViewCount(vref);

  if (newViewCount > 0 && newViewCount % ADMIN_NOTIFY_EVERY === 0) {
    try {
      const admins = await db.collection('users').where('isAdmin', '==', true).limit(25).get();
      const batch = db.batch();
      for (const a of admins.docs) {
        const nref = db.collection(`users/${a.id}/notifications`).doc();
        batch.set(nref, {
          type: 'admin_alert',
          fromUid: uid,
          fromUsername: 'Leap',
          read: false,
          snippet: `Video ${videoId} reached ${newViewCount} views`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
      await batch.commit();
    } catch (e) {
      logger.warn('admin view milestone notify failed', { videoId, e });
    }
  }

  return { ok: true, viewCount: newViewCount };
});

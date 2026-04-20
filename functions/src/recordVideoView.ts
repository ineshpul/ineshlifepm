import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

const REGION = 'us-central1';

const VIEW_THROTTLE_MS = 6 * 60 * 60 * 1000;
const ADMIN_NOTIFY_EVERY = 25;

/**
 * Counts a single authenticated view per viewer per video, throttled server-side.
 * Writes a milestone row to each admin inbox (server-side) on coarse view counts.
 */
export const recordVideoViewCallable = onCall({ region: REGION }, async (request) => {
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
    return { ok: true, viewCount: Number(preData.viewCount ?? 0) };
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

    tx.set(markRef, { at: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(vref, { viewCount: admin.firestore.FieldValue.increment(1) });
  });

  const after = await vref.get();
  const newViewCount = after.exists ? Number(after.data()?.viewCount ?? 0) : 0;

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

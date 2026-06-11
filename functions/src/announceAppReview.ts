import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { CALLABLE_OPTIONS } from './callableOptions';

async function assertStaff(uid: string): Promise<void> {
  const snap = await admin.firestore().doc(`users/${uid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Staff only.');
  const d = snap.data();
  if (d?.isAdmin !== true && d?.isModerator !== true) {
    throw new HttpsError('permission-denied', 'Moderator access required.');
  }
}

/** Staff-only: in-app + push prompt for users to leave an App Store review. */
export const staffAnnounceAppReviewCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  await assertStaff(uid);

  const db = admin.firestore();
  const snippet =
    'Enjoying Leap? Tap to leave a quick App Store review — it helps more people discover the daily leap.';
  let announced = 0;
  let last: admin.firestore.QueryDocumentSnapshot | undefined;

  for (;;) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const docSnap of snap.docs) {
      const userId = docSnap.id;
      const notifRef = db.collection(`users/${userId}/notifications`).doc();
      batch.set(notifRef, {
        type: 'app_review_request',
        fromUid: 'leap',
        fromUsername: 'Leap',
        videoId: null,
        snippet,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      announced += 1;
    }
    await batch.commit();
    last = snap.docs[snap.docs.length - 1];
  }

  return { ok: true as const, announced };
});

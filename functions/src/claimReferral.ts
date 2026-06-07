import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

import { CALLABLE_OPTIONS } from './callableOptions';
import { normalizeReferrerUsername, resolveReferrerUidByUsername } from './referralRewards';

const REFERRALS_COLLECTION = 'referrals';

/** Public lookup for signup UX — returns whether a username exists (no uid exposed). */
export const resolveReferrerUsernameCallable = onCall(
  { ...CALLABLE_OPTIONS, invoker: 'public' },
  async (request) => {
    const username = String(request.data?.username ?? '').trim();
    const key = normalizeReferrerUsername(username);
    if (!key) {
      return { found: false as const };
    }

    const db = admin.firestore();
    const resolved = await resolveReferrerUidByUsername(db, username);
    if (!resolved) {
      return { found: false as const };
    }

    return {
      found: true as const,
      username: resolved.username,
    };
  }
);

/** Link the signed-in user to a referrer once, at signup. */
export const claimReferralCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const refereeUid = request.auth?.uid;
  if (!refereeUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const username = String(request.data?.referrerUsername ?? '').trim();
  if (!username) throw new HttpsError('invalid-argument', 'referrerUsername required.');

  const db = admin.firestore();
  const resolved = await resolveReferrerUidByUsername(db, username);
  if (!resolved) {
    throw new HttpsError('not-found', 'Could not find that username.');
  }

  const referrerUid = resolved.uid;
  if (referrerUid === refereeUid) {
    throw new HttpsError('invalid-argument', 'You cannot refer yourself.');
  }

  const refereeRef = db.doc(`users/${refereeUid}`);
  const referralRef = db.doc(`${REFERRALS_COLLECTION}/${referrerUid}_${refereeUid}`);

  await db.runTransaction(async (tx) => {
    const refereeSnap = await tx.get(refereeRef);
    if (!refereeSnap.exists) {
      throw new HttpsError('failed-precondition', 'Profile not ready — try again in a moment.');
    }

    const existingReferrer = String(refereeSnap.data()?.referredByUid ?? '').trim();
    if (existingReferrer) {
      if (existingReferrer === referrerUid) return;
      throw new HttpsError('failed-precondition', 'Referral already claimed.');
    }

    tx.set(
      refereeRef,
      {
        referredByUid: referrerUid,
        referredAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      referralRef,
      {
        referrerUid,
        refereeUid,
        referrerUsernameLower: resolved.usernameLower,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        activationBonusGranted: false,
      },
      { merge: true }
    );
  });

  return {
    ok: true as const,
    referrerUsername: resolved.username,
  };
});

/** Admin-only: one-time in-app + push announcement for the referral program. */
export const adminAnnounceReferralProgramCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const adminSnap = await admin.firestore().doc(`users/${uid}`).get();
  if (!adminSnap.exists || adminSnap.data()?.isAdmin !== true) {
    throw new HttpsError('permission-denied', 'Admin only.');
  }

  const db = admin.firestore();
  const snippet =
    'Invite friends — earn inches when they complete their first leap and when you leap together.';
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
        type: 'referral_launch',
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

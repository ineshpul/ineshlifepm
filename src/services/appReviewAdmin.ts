import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export async function staffAnnounceAppReview(): Promise<{ announced: number }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  const cur = auth.currentUser;
  if (!cur) throw new Error('Sign in required.');
  await cur.getIdToken(true);

  const fn = httpsCallable<void, { ok: true; announced: number }>(
    firebaseFunctions(),
    'staffAnnounceAppReviewCallable'
  );
  const res = await fn();
  return { announced: res.data.announced };
}

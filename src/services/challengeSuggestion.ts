import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

/**
 * Ensures Auth is fully restored and a fresh ID token exists before calling a callable.
 * Without this, `httpsCallable` can omit the `Authorization` header (race on cold start /
 * Functions resolving before Auth registers), which surfaces as `functions/unauthenticated`.
 */
export async function submitChallengeSuggestion(text: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  const cur = auth.currentUser;
  if (!cur) {
    throw new Error('Sign in required.');
  }
  await cur.getIdToken(true);

  const fn = httpsCallable(firebaseFunctions(), 'submitChallengeSuggestionCallable');
  await fn({ text });
}

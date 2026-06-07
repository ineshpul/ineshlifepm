import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export type ResolveReferrerResult =
  | { found: true; username: string }
  | { found: false };

export async function resolveReferrerUsername(username: string): Promise<ResolveReferrerResult> {
  if (!isFirebaseConfigured()) return { found: false };
  const fn = httpsCallable<{ username: string }, ResolveReferrerResult>(
    firebaseFunctions(),
    'resolveReferrerUsernameCallable'
  );
  const res = await fn({ username: username.trim() });
  return res.data;
}

export async function claimReferral(referrerUsername: string): Promise<{ referrerUsername: string }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  const cur = auth.currentUser;
  if (!cur) throw new Error('Sign in required.');
  await cur.getIdToken(true);

  const fn = httpsCallable<{ referrerUsername: string }, { ok: true; referrerUsername: string }>(
    firebaseFunctions(),
    'claimReferralCallable'
  );
  const res = await fn({ referrerUsername: referrerUsername.trim() });
  return { referrerUsername: res.data.referrerUsername };
}

export async function adminAnnounceReferralProgram(): Promise<{ announced: number }> {
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
    'adminAnnounceReferralProgramCallable'
  );
  const res = await fn();
  return { announced: res.data.announced };
}

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

function isRetryableReferralClaimError(e: unknown): boolean {
  const code =
    e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code ?? '') : '';
  return code === 'functions/failed-precondition';
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

  const trimmed = referrerUsername.trim();
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fn({ referrerUsername: trimmed });
      return { referrerUsername: res.data.referrerUsername };
    } catch (e) {
      lastError = e;
      if (isRetryableReferralClaimError(e) && attempt < 2) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastError ?? new Error('Referral claim failed.');
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

import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export async function purchaseRecordingAttemptWithScore(challengeDate: string): Promise<{
  remaining: number;
  baseReductionInches: number;
}> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const cur = firebaseAuth().currentUser;
  if (!cur) throw new Error('Sign in required.');

  const fn = httpsCallable(firebaseFunctions(), 'purchaseRecordingAttemptCallable');
  const res = await fn({ challengeDate });
  return res.data as {
    remaining: number;
    baseReductionInches: number;
  };
}

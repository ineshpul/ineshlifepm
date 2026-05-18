import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export async function adminGrantRecordingAttempt(challengeDate: string): Promise<{
  remaining: number;
  bonusRecordingAttempts: number;
}> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const cur = firebaseAuth().currentUser;
  if (!cur) throw new Error('Sign in required.');

  const fn = httpsCallable(firebaseFunctions(), 'adminGrantRecordingAttemptCallable');
  const res = await fn({ challengeDate });
  return res.data as {
    remaining: number;
    bonusRecordingAttempts: number;
  };
}

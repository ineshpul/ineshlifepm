import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

/** Reconcile `dailyChallengeStats` with approved videos after a delete (server also runs on delete trigger). */
export async function syncApprovedPostCountForLeapDay(dayKey: string): Promise<void> {
  if (!isFirebaseConfigured() || !dayKey.trim()) return;
  try {
    const fn = httpsCallable<{ dayKey: string }, { count: number }>(
      firebaseFunctions(),
      'syncApprovedPostCountForLeapDay'
    );
    await fn({ dayKey: dayKey.trim() });
  } catch {
    // non-blocking — UI count uses live videos query
  }
}

import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

/**
 * Records one view for the signed-in user (throttled server-side). No-ops if Firebase is off.
 */
export async function recordVideoView(videoId: string): Promise<void> {
  if (!isFirebaseConfigured() || !videoId) return;
  try {
    const fn = httpsCallable(firebaseFunctions(), 'recordVideoViewCallable');
    await fn({ videoId });
  } catch {
    /* ignore */
  }
}

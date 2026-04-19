import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';
import type { VerticalScoreComputationResult } from '../types/verticalScore';

const DEBOUNCE_MS = 2000;

const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Recomputes the signed-in user’s Vertical Score via Cloud Function (writes are not client-trusted).
 * Returns null if not signed in as `ownerId`, Firebase is off, or the callable is unavailable.
 */
export async function recomputeVerticalScoreForUser(
  ownerId: string
): Promise<VerticalScoreComputationResult | null> {
  if (!isFirebaseConfigured() || !ownerId) return null;
  const cur = firebaseAuth().currentUser;
  if (!cur || cur.uid !== ownerId) return null;

  try {
    const fn = httpsCallable(firebaseFunctions(), 'recomputeVerticalScoreCallable');
    const res = await fn();
    return res.data as VerticalScoreComputationResult;
  } catch {
    return null;
  }
}

/**
 * Coalesces rapid triggers (e.g. multiple deletes) into a single recompute.
 */
export function scheduleVerticalScoreRecompute(ownerId: string, delayMs = DEBOUNCE_MS): void {
  if (!isFirebaseConfigured() || !ownerId) return;
  const prev = debouncers.get(ownerId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    debouncers.delete(ownerId);
    void recomputeVerticalScoreForUser(ownerId);
  }, delayMs);
  debouncers.set(ownerId, t);
}

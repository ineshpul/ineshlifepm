import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';
import type { LeapStatsRecomputeResult } from '../types/verticalScore';

const recomputeDebounceMs = 2500;
const pendingByUid = new Map<string, ReturnType<typeof setTimeout>>();

export async function recomputeVerticalScoreForUser(uid: string): Promise<LeapStatsRecomputeResult | null> {
  if (!isFirebaseConfigured() || !uid) return null;
  const fn = httpsCallable<void, LeapStatsRecomputeResult>(
    firebaseFunctions(),
    'recomputeVerticalScoreCallable'
  );
  const res = await fn();
  return res.data ?? null;
}

export function scheduleVerticalScoreRecompute(uid: string): void {
  if (!uid) return;
  const prev = pendingByUid.get(uid);
  if (prev) clearTimeout(prev);
  pendingByUid.set(
    uid,
    setTimeout(() => {
      pendingByUid.delete(uid);
      void recomputeVerticalScoreForUser(uid).catch(() => {});
    }, recomputeDebounceMs)
  );
}

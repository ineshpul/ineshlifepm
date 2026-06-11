import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';
import type { LeapStatsRecomputeResult } from '../types/verticalScore';

const recomputeDebounceMs = 2500;
const pendingByUid = new Map<string, ReturnType<typeof setTimeout>>();

/** Cooldown between session heal recomputes (login / app foreground). */
const sessionHealCooldownMs = 5 * 60 * 1000;
const lastSessionHealByUid = new Map<string, number>();

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

/**
 * Re-sync leap stats from awarded videos on login / app open (server-side recompute).
 * Uses existing `recomputeVerticalScoreCallable` — no new deployed function name.
 */
export function scheduleLeapStatsHealOnSession(uid: string): void {
  if (!uid) return;
  const now = Date.now();
  const last = lastSessionHealByUid.get(uid) ?? 0;
  if (now - last < sessionHealCooldownMs) return;
  lastSessionHealByUid.set(uid, now);
  void recomputeVerticalScoreForUser(uid).catch(() => {});
}

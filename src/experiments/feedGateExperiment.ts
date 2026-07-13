import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';

import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';

export type ExperimentCohort = 'gate_on' | 'gate_off';

/** Users with this many posts or more are excluded from the experiment. */
export const EXPERIMENT_MAX_POSTS_EXCLUSIVE = 10;

const DAY1_KEY = (uid: string) => `exp_day1_return_${uid}`;
const DAY7_KEY = (uid: string) => `exp_day7_return_${uid}`;
const SIGNUP_EVENT_KEY = (uid: string) => `exp_signup_completed_${uid}`;

export function parseExperimentCohort(value: unknown): ExperimentCohort | null {
  if (value === 'gate_on' || value === 'gate_off') return value;
  return null;
}

/**
 * Deterministic 50/50 assignment from Firebase UID (no Math.random).
 * Same UID always maps to the same cohort.
 */
export function cohortFromUid(uid: string): ExperimentCohort {
  let hash = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2 === 0 ? 'gate_on' : 'gate_off';
}

export function isExperimentFeedUnlocked(cohort: ExperimentCohort | null | undefined): boolean {
  return cohort === 'gate_off';
}

async function countUserPosts(uid: string): Promise<number> {
  const q = query(collection(firestore(), 'videos'), where('uid', '==', uid));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

/**
 * Write-once cohort assignment.
 * - New signups (`forceEligible`): always assign.
 * - Existing users: assign only if they have fewer than 10 posts and no cohort yet.
 * Never overwrites an existing `experimentCohort`.
 */
export async function ensureExperimentCohort(
  uid: string,
  opts?: { forceEligible?: boolean }
): Promise<ExperimentCohort | null> {
  if (!uid || !isFirebaseConfigured()) return null;

  const ref = doc(firestore(), 'users', uid);
  const existingSnap = await getDoc(ref);
  const existing = parseExperimentCohort(existingSnap.data()?.experimentCohort);
  if (existing) return existing;

  if (!opts?.forceEligible) {
    if (!existingSnap.exists()) return null;
    try {
      const posts = await countUserPosts(uid);
      if (posts >= EXPERIMENT_MAX_POSTS_EXCLUSIVE) return null;
    } catch {
      return null;
    }
  }

  const cohort = cohortFromUid(uid);

  // Profile must already exist (bootstrap first) — assignment is a one-time update only.
  for (let attempt = 0; attempt < 5; attempt++) {
    const live = await getDoc(ref);
    if (live.exists()) break;
    if (!opts?.forceEligible) return null;
    await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
  }

  try {
    const assigned = await runTransaction(firestore(), async (tx) => {
      const snap = await tx.get(ref);
      const already = parseExperimentCohort(snap.data()?.experimentCohort);
      if (already) return already;
      if (!snap.exists()) return null;

      tx.update(ref, {
        experimentCohort: cohort,
        experimentAssignedAt: serverTimestamp(),
      });
      return cohort;
    });
    return assigned;
  } catch {
    const retry = await getDoc(ref);
    return parseExperimentCohort(retry.data()?.experimentCohort);
  }
}

export function experimentAssignedAtMs(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof (raw as Timestamp)?.toMillis === 'function') {
    return (raw as Timestamp).toMillis();
  }
  return null;
}

/** Calendar days since account creation (UTC day buckets). */
export function calendarDaysSinceSignup(creationTimeMs: number, nowMs = Date.now()): number {
  const start = new Date(creationTimeMs);
  const now = new Date(nowMs);
  const utcStart = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const utcNow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((utcNow - utcStart) / 86_400_000);
}

export async function markSignupCompletedLogged(uid: string): Promise<boolean> {
  const key = SIGNUP_EVENT_KEY(uid);
  const prev = await AsyncStorage.getItem(key);
  if (prev === '1') return false;
  await AsyncStorage.setItem(key, '1');
  return true;
}

export async function maybeMarkDayReturn(
  uid: string,
  day: 1 | 7
): Promise<boolean> {
  const key = day === 1 ? DAY1_KEY(uid) : DAY7_KEY(uid);
  const prev = await AsyncStorage.getItem(key);
  if (prev === '1') return false;

  const field = day === 1 ? 'experimentDay1Returned' : 'experimentDay7Returned';
  try {
    await updateDoc(doc(firestore(), 'users', uid), { [field]: true });
  } catch {
    // Profile may not exist yet — still mark local so we don't spam Analytics.
  }
  await AsyncStorage.setItem(key, '1');
  return true;
}

export async function incrementExperimentSessionSeconds(uid: string, seconds: number): Promise<void> {
  if (!uid || !Number.isFinite(seconds) || seconds <= 0) return;
  const ref = doc(firestore(), 'users', uid);
  try {
    await runTransaction(firestore(), async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      if (!parseExperimentCohort(snap.data()?.experimentCohort)) return;
      const prev = Number(snap.data()?.experimentTotalSessionSeconds ?? 0);
      const next = (Number.isFinite(prev) ? prev : 0) + Math.floor(seconds);
      tx.update(ref, { experimentTotalSessionSeconds: next });
    });
  } catch {
    // ignore — analytics must never break the app
  }
}

export function authAccountCreationMs(): number | null {
  try {
    const raw = firebaseAuth().currentUser?.metadata?.creationTime;
    if (!raw) return null;
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

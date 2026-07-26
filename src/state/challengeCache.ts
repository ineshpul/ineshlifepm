import AsyncStorage from '@react-native-async-storage/async-storage';

import { computeFeedViewingFromNow } from '../utils/nyTime';

export type CachedChallenge = {
  dateKey: string;
  title: string;
  subtitle: string;
  maxDurationSeconds: number;
  maxRecordingAttempts: number;
  allowLibraryAttach: boolean;
};

const STORAGE_PREFIX = 'leap:challenge:v1:';
const DEFAULT_MAX_RECORDING_ATTEMPTS = 3;

const memory = new Map<string, CachedChallenge>();

function storageKey(dateKey: string) {
  return `${STORAGE_PREFIX}${dateKey}`;
}

function normalizeDuration(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 60;
  return Math.min(300, Math.max(10, n));
}

function normalizeAttempts(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_MAX_RECORDING_ATTEMPTS;
  return Math.min(50, Math.max(1, n));
}

function parseCached(raw: string, dateKey: string): CachedChallenge | null {
  try {
    const data = JSON.parse(raw) as Partial<CachedChallenge>;
    const title = String(data?.title ?? '').trim();
    if (!title || String(data?.dateKey ?? '') !== dateKey) return null;
    return {
      dateKey,
      title,
      subtitle: String(data?.subtitle ?? ''),
      maxDurationSeconds: normalizeDuration(data?.maxDurationSeconds),
      maxRecordingAttempts: normalizeAttempts(data?.maxRecordingAttempts),
      allowLibraryAttach: data?.allowLibraryAttach === true,
    };
  } catch {
    return null;
  }
}

/** In-memory hit only — safe during render. */
export function peekChallengeCache(dateKey: string): CachedChallenge | null {
  return memory.get(dateKey) ?? null;
}

export async function readChallengeCache(dateKey: string): Promise<CachedChallenge | null> {
  const hit = memory.get(dateKey);
  if (hit) return hit;
  try {
    const raw = await AsyncStorage.getItem(storageKey(dateKey));
    if (!raw) return null;
    const parsed = parseCached(raw, dateKey);
    if (parsed) memory.set(dateKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeChallengeCache(challenge: CachedChallenge): Promise<void> {
  const title = challenge.title.trim();
  if (!title) return;
  memory.set(challenge.dateKey, challenge);
  try {
    await AsyncStorage.setItem(storageKey(challenge.dateKey), JSON.stringify(challenge));
  } catch {
    // ignore quota / IO errors
  }
}

/** Warm today's challenge from disk as early as possible (App startup). */
export function prefetchTodayChallengeCache(): void {
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  void readChallengeCache(viewingChallengeDateKey);
}

import { getExpoExtra } from './expoExtra';

/** Accept boolean `true` or a legacy string `"true"` sometimes seen in hand-edited Firestore data. */
export function parseProfileIsAdmin(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true;
  return false;
}

/** Same truthiness rules as {@link parseProfileIsAdmin} — hand-edited Firestore may use string `"true"`. */
export function parseProfileIsModerator(value: unknown): boolean {
  return parseProfileIsAdmin(value);
}

export function getAdminUids(): string[] {
  const extra = getExpoExtra();
  const raw = extra?.adminUids;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function isAdminUid(uid: string | undefined | null) {
  if (!uid) return false;
  return getAdminUids().includes(uid);
}

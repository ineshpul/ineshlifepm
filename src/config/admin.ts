import { getExpoExtra } from './expoExtra';

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

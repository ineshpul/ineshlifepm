import Constants from 'expo-constants';

function readExtra(): any {
  return (Constants.expoConfig as any)?.extra ?? (Constants as any)?.manifest?.extra ?? {};
}

export function getAdminUids(): string[] {
  const extra = readExtra();
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

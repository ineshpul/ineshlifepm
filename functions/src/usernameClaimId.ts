/** Canonical `usernameClaims` doc id (matches client `usernameClaimDocId`). */
export function usernameClaimDocId(raw: string): string {
  let s = String(raw ?? '')
    .trim()
    .replace(/^@+/u, '')
    .toLowerCase();
  s = s.replace(/\s+/g, '_');
  s = s.replace(/[^a-z0-9_]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!s) s = 'user';
  return s.length > 40 ? s.slice(0, 40) : s;
}

export function isPlaceholderUsername(raw: unknown): boolean {
  const u = String(raw ?? '').trim();
  return u === '' || u.toLowerCase() === 'user';
}

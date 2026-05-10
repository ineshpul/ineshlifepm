/**
 * Canonical form for `users.usernameLower` and doc id in `usernameClaims` (case-insensitive uniqueness).
 * Strips @, lowercases, turns spaces into `_`, strips other punctuation to `_`, max 40 chars.
 */
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

/** @deprecated use {@link usernameClaimDocId} — kept for call sites; same behavior. */
export function usernameToSearchPrefixKey(username: string): string {
  return usernameClaimDocId(username);
}

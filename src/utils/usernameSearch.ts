/**
 * Normalizes a display username for prefix search on `users.usernameLower`.
 * Strips leading @ and lowercases (Firestore range query is case-sensitive).
 */
export function usernameToSearchPrefixKey(username: string): string {
  return username.trim().replace(/^@+/u, '').toLowerCase();
}

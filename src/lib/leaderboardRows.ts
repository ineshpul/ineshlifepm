/**
 * Leaderboard timeframe keys (public contract).
 * Accepts legacy labels used elsewhere in the app.
 */
export type LeaderboardTimeframe = 'daily' | 'all_time';

export function parseLeaderboardTimeframe(raw: unknown): LeaderboardTimeframe | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (s === 'daily') return 'daily';
  if (s === 'all_time' || s === 'alltime' || s === 'all') return 'all_time';
  return null;
}

export type LeaderboardWireRow = {
  rank: number;
  userId: string;
  name: string;
  /** Firestore @handle for navigation / header hint (may be empty). */
  username: string;
  avatarUrl?: string;
  score: number;
  isCurrentUser: boolean;
};

export function leaderboardDisplayName(data: Record<string, unknown> | undefined): string {
  const dn = String(data?.displayName ?? '').trim();
  if (dn) return dn;
  const un = String(data?.username ?? '').trim();
  if (un) return un;
  return 'Anonymous';
}

export function leaderboardAvatarUrl(data: Record<string, unknown> | undefined): string | undefined {
  const a = data?.photoUrl ?? data?.photoURL ?? data?.avatarUrl;
  return typeof a === 'string' && a.trim() ? a.trim() : undefined;
}

export function initialsFromDisplayName(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const a = parts[0]?.[0];
    const b = parts[1]?.[0];
    return `${a ?? ''}${b ?? ''}`.toUpperCase() || '?';
  }
  const single = parts[0] ?? '';
  return (single.slice(0, 2) || '?').toUpperCase();
}

/** Stable order: score desc, then user id asc (deterministic ties). */
export function sortLeaderboardDocs<T extends { id: string; score: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
}

export function wireRowsFromSorted<
  T extends { id: string; score: number; name: string; username: string; avatarUrl?: string },
>(sorted: T[], currentUid: string | undefined): LeaderboardWireRow[] {
  return sorted.map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    score: row.score,
    isCurrentUser: Boolean(currentUid && row.id === currentUid),
  }));
}

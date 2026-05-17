/**
 * Leaderboard timeframe keys (public contract).
 */
export type LeaderboardTimeframe = 'daily' | 'weekly' | 'all_time';

export function parseLeaderboardTimeframe(raw: unknown): LeaderboardTimeframe | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (s === 'daily') return 'daily';
  if (s === 'weekly' || s === 'week') return 'weekly';
  if (s === 'all_time' || s === 'alltime' || s === 'all') return 'all_time';
  return null;
}

export type LeaderboardWireRow = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  avatarUrl?: string;
  score: number;
  /** All-time tie-break (cumulative inches). */
  lifetimeInches?: number;
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

export function sortLeaderboardDocs<T extends { id: string; score: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });
}

export function sortAllTimeLeaderboardDocs<
  T extends { id: string; score: number; lifetimeInches?: number },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const lb = Number(b.lifetimeInches ?? b.score ?? 0);
    const la = Number(a.lifetimeInches ?? a.score ?? 0);
    if (lb !== la) return lb - la;
    return a.id.localeCompare(b.id);
  });
}

export function wireRowsFromSorted<
  T extends {
    id: string;
    score: number;
    name: string;
    username: string;
    avatarUrl?: string;
    lifetimeInches?: number;
  },
>(sorted: T[], currentUid: string | undefined): LeaderboardWireRow[] {
  return sorted.map((row, i) => ({
    rank: i + 1,
    userId: row.id,
    name: row.name,
    username: row.username,
    avatarUrl: row.avatarUrl,
    score: row.score,
    lifetimeInches: row.lifetimeInches,
    isCurrentUser: Boolean(currentUid && row.id === currentUid),
  }));
}

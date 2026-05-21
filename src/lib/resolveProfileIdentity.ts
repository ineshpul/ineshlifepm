/** Placeholder usernames that must not be shown as resolved identity. */
export function isPlaceholderUsername(value: string | undefined | null): boolean {
  const u = value != null ? String(value).trim() : '';
  return u === '' || u.toLowerCase() === 'user';
}

export function normalizeUsernameHint(hint: string | undefined | null): string {
  if (hint == null) return '';
  return String(hint).replace(/^@+/u, '').trim();
}

export function photoUrlFromRecord(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '';
  return String(data.photoUrl ?? data.photoURL ?? data.avatarUrl ?? '').trim();
}

export function usernameFromRecord(data: Record<string, unknown> | null | undefined): string {
  if (!data) return '';
  const u = data.username != null ? String(data.username).trim() : '';
  return isPlaceholderUsername(u) ? '' : u;
}

export type ResolvedProfileIdentity = {
  username: string;
  photoUrl: string;
};

/**
 * Prefer live `users/{uid}` fields, then navigation hint, then denormalized leap/video row.
 */
export function resolveProfileIdentity(args: {
  profile: Record<string, unknown> | null | undefined;
  usernameHint?: string | null;
  videoFallback?: { username?: string; photoUrl?: string } | null;
}): ResolvedProfileIdentity {
  const fromProfile = usernameFromRecord(args.profile ?? null);
  const profilePhoto = photoUrlFromRecord(args.profile ?? null);

  if (fromProfile) {
    return { username: fromProfile, photoUrl: profilePhoto };
  }

  const hint = normalizeUsernameHint(args.usernameHint);
  if (hint) {
    return { username: hint, photoUrl: profilePhoto };
  }

  const videoUser = args.videoFallback?.username != null ? String(args.videoFallback.username).trim() : '';
  const videoPhoto =
    args.videoFallback?.photoUrl != null ? String(args.videoFallback.photoUrl).trim() : '';
  if (!isPlaceholderUsername(videoUser)) {
    return { username: videoUser, photoUrl: videoPhoto || profilePhoto };
  }

  return { username: '', photoUrl: profilePhoto || videoPhoto };
}

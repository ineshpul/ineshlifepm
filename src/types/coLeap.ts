/** Poster + invitees; invitees confirm to receive posted-today credit. */
export const MAX_CO_LEAP_PARTICIPANTS = 4;
export const MAX_CO_LEAP_INVITEES = MAX_CO_LEAP_PARTICIPANTS - 1;

export type CoLeapInviteeStatus = 'pending' | 'confirmed';

export type CoLeapInvitee = {
  uid: string;
  username: string;
  photoUrl?: string;
  status: CoLeapInviteeStatus;
  /** Set when the invitee confirms. */
  confirmedAtMs?: number;
  /** Invitee's day-credit video id (`{inviteeUid}_{challengeDate}`). */
  creditVideoId?: string;
};

/** Selected before post — status is always pending until confirm. */
export type CoLeapInviteePick = {
  uid: string;
  username: string;
  photoUrl?: string;
};

export function normalizeCoLeapInvitees(
  picks: readonly CoLeapInviteePick[] | undefined | null
): CoLeapInvitee[] {
  if (!picks?.length) return [];
  const out: CoLeapInvitee[] = [];
  const seen = new Set<string>();
  for (const pick of picks) {
    const uid = String(pick.uid ?? '').trim();
    const username = String(pick.username ?? '').trim().replace(/^@+/u, '') || 'user';
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const photoUrl = String(pick.photoUrl ?? '').trim();
    out.push({
      uid,
      username,
      ...(photoUrl ? { photoUrl } : {}),
      status: 'pending',
    });
    if (out.length >= MAX_CO_LEAP_INVITEES) break;
  }
  return out;
}

import type { CoLeapInvitee, CoLeapInviteeStatus } from '../types/coLeap';
import { MAX_CO_LEAP_INVITEES } from '../types/coLeap';

export function parseCoLeapInvitees(raw: unknown): CoLeapInvitee[] {
  if (!Array.isArray(raw)) return [];
  const out: CoLeapInvitee[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const uid = String(r.uid ?? '').trim();
    const username = String(r.username ?? '').trim().replace(/^@+/u, '') || 'user';
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const status: CoLeapInviteeStatus =
      String(r.status ?? '').trim() === 'confirmed' ? 'confirmed' : 'pending';
    const photoUrl = String(r.photoUrl ?? '').trim();
    const creditVideoId = String(r.creditVideoId ?? '').trim();
    let confirmedAtMs: number | undefined;
    const confirmedAt = r.confirmedAt as { toMillis?: () => number } | undefined;
    if (confirmedAt && typeof confirmedAt.toMillis === 'function') {
      confirmedAtMs = confirmedAt.toMillis();
    } else if (typeof r.confirmedAtMs === 'number') {
      confirmedAtMs = r.confirmedAtMs;
    }
    out.push({
      uid,
      username,
      status,
      ...(photoUrl ? { photoUrl } : {}),
      ...(creditVideoId ? { creditVideoId } : {}),
      ...(confirmedAtMs != null ? { confirmedAtMs } : {}),
    });
    if (out.length >= MAX_CO_LEAP_INVITEES) break;
  }
  return out;
}

/** Hide mirror credit docs from the shared feed (one post per Co-Leap). */
export function isHiddenCoLeapCreditDoc(data: Record<string, unknown> | undefined | null): boolean {
  if (!data) return false;
  return data.isCoLeapCredit === true || data.hideFromFeed === true;
}

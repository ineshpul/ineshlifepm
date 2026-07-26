/** True when the leap-day video doc still represents an active post (not deleted/rejected/nulled). */
export function isActiveLeapVideoDoc(
  data: { deleted?: boolean; moderationStatus?: string; uid?: string; isCoLeapCredit?: boolean } | undefined,
  ownerUid: string
): boolean {
  if (!data) return false;
  if (data.deleted === true) return false;
  const status = String(data.moderationStatus ?? '').trim().toLowerCase();
  if (status === 'rejected' || status === 'nulled') return false;
  return String(data.uid ?? ownerUid) === ownerUid;
}

export function isCoLeapCreditDoc(
  data: { isCoLeapCredit?: boolean; hideFromFeed?: boolean; source?: string } | undefined
): boolean {
  if (!data) return false;
  return data.isCoLeapCredit === true || data.source === 'co_leap';
}

/**
 * Solo leap for the day — blocks another solo post / recording lock.
 * Co-Leap credit docs do NOT block; invitees can still post their own.
 */
export function blocksSoloLeapRepost(
  data: { deleted?: boolean; moderationStatus?: string; uid?: string; isCoLeapCredit?: boolean; source?: string; url?: string; storagePath?: string } | undefined,
  ownerUid: string
): boolean {
  if (isOrphanLeapSoloVideoDoc(data, ownerUid)) return false;
  if (!isActiveLeapVideoDoc(data, ownerUid)) return false;
  if (isCoLeapCreditDoc(data)) return false;
  return true;
}

/** Doc id for invitee Co-Leap day credit (separate from solo `uid_date`). */
export function coLeapCreditVideoDocId(uid: string, challengeDate: string): string {
  return `${uid}_${challengeDate}_coleap`;
}

/** True when the leap doc has a real upload (not a placeholder row from a failed/partial post). */
export function leapSoloVideoHasCommittedMedia(
  data: { url?: string; storagePath?: string } | undefined
): boolean {
  if (!data) return false;
  const url = String(data.url ?? '').trim();
  const storagePath = String(data.storagePath ?? '').trim();
  return url.length > 0 || storagePath.length > 0;
}

/**
 * Active solo doc with no media — blocks recording but is not a real post.
 * Common after failed uploads or delete/upload races.
 */
export function isOrphanLeapSoloVideoDoc(
  data:
    | {
        deleted?: boolean;
        moderationStatus?: string;
        uid?: string;
        isCoLeapCredit?: boolean;
        source?: string;
        url?: string;
        storagePath?: string;
      }
    | undefined,
  ownerUid: string
): boolean {
  if (!isActiveLeapVideoDoc(data, ownerUid)) return false;
  if (isCoLeapCreditDoc(data)) return false;
  return !leapSoloVideoHasCommittedMedia(data);
}

import type { DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';

/** True when the leap-day video doc still represents an active post (not deleted/rejected/nulled). */
export function isActiveLeapVideoDoc(
  data: DocumentData | undefined,
  ownerUid: string
): boolean {
  if (!data) return false;
  if (data.deleted === true) return false;
  const status = String(data.moderationStatus ?? '').trim().toLowerCase();
  if (status === 'rejected' || status === 'nulled') return false;
  const owner = String(data.uid ?? ownerUid).trim();
  return owner === ownerUid;
}

export function isCoLeapCreditDoc(data: DocumentData | undefined): boolean {
  if (!data) return false;
  return data.isCoLeapCredit === true || String(data.source ?? '') === 'co_leap';
}

export function isIntroLeapDoc(data: DocumentData | undefined): boolean {
  if (!data) return false;
  return data.isIntroLeap === true || String(data.source ?? '') === 'intro';
}

/** Solo leap only — Co-Leap credits do not block another post that day. */
export function videoBlocksLeapRepost(
  snap: DocumentSnapshot,
  ownerUid: string
): boolean {
  if (!snap.exists) return false;
  const data = snap.data();
  if (isOrphanLeapSoloVideoDoc(data, ownerUid)) return false;
  if (!isActiveLeapVideoDoc(data, ownerUid)) return false;
  if (isCoLeapCreditDoc(data)) return false;
  return true;
}

export function coLeapCreditVideoDocId(uid: string, challengeDate: string): string {
  return `${uid}_${challengeDate}_coleap`;
}

export function leapSoloVideoHasCommittedMedia(data: DocumentData | undefined): boolean {
  if (!data) return false;
  const url = String(data.url ?? '').trim();
  const storagePath = String(data.storagePath ?? '').trim();
  return url.length > 0 || storagePath.length > 0;
}

/** Active solo doc with no uploaded media — not a real post; safe to remove when healing. */
export function isOrphanLeapSoloVideoDoc(data: DocumentData | undefined, ownerUid: string): boolean {
  if (!isActiveLeapVideoDoc(data, ownerUid)) return false;
  if (isCoLeapCreditDoc(data)) return false;
  return !leapSoloVideoHasCommittedMedia(data);
}

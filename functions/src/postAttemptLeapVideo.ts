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

/** Solo leap only — Co-Leap credits do not block another post that day. */
export function videoBlocksLeapRepost(
  snap: DocumentSnapshot,
  ownerUid: string
): boolean {
  if (!snap.exists) return false;
  const data = snap.data();
  if (!isActiveLeapVideoDoc(data, ownerUid)) return false;
  if (isCoLeapCreditDoc(data)) return false;
  return true;
}

export function coLeapCreditVideoDocId(uid: string, challengeDate: string): string {
  return `${uid}_${challengeDate}_coleap`;
}

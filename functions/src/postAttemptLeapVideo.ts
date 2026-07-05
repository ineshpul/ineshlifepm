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

export function videoBlocksLeapRepost(
  snap: DocumentSnapshot,
  ownerUid: string
): boolean {
  return snap.exists && isActiveLeapVideoDoc(snap.data(), ownerUid);
}

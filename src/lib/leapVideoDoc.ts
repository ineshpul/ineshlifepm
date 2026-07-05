/** True when the leap-day video doc still represents an active post (not deleted/rejected/nulled). */
export function isActiveLeapVideoDoc(
  data: { deleted?: boolean; moderationStatus?: string; uid?: string } | undefined,
  ownerUid: string
): boolean {
  if (!data) return false;
  if (data.deleted === true) return false;
  const status = String(data.moderationStatus ?? '').trim().toLowerCase();
  if (status === 'rejected' || status === 'nulled') return false;
  return String(data.uid ?? ownerUid) === ownerUid;
}

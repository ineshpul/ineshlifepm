import { collection, documentId, getDocs, query, where } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';

/** Batch-load `users/{uid}` for leaderboard avatars and display names (max 30 per query). */
export async function fetchUserProfilesByIds(
  uids: readonly string[]
): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(uids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  const out = new Map<string, Record<string, unknown>>();
  if (unique.length === 0) return out;

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const snap = await getDocs(
      query(collection(firestore(), 'users'), where(documentId(), 'in', chunk))
    );
    snap.docs.forEach((d) => out.set(d.id, d.data() as Record<string, unknown>));
  }
  return out;
}

import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { usernameToSearchPrefixKey } from '../utils/usernameSearch';

export type UserSearchHit = {
  uid: string;
  username: string;
  photoUrl?: string;
};

/**
 * Prefix search on `users` using `usernameLower` (maintained on profile save and auth sync).
 */
export function subscribeUsersByUsernamePrefix(
  rawPrefix: string,
  excludeUid: string | undefined,
  max: number,
  onRows: (rows: UserSearchHit[]) => void
): () => void {
  if (!isFirebaseConfigured()) {
    onRows([]);
    return () => {};
  }
  const prefix = usernameToSearchPrefixKey(rawPrefix);
  if (!prefix) {
    onRows([]);
    return () => {};
  }
  const end = `${prefix}\uf8ff`;
  const q = query(
    collection(firestore(), 'users'),
    where('usernameLower', '>=', prefix),
    where('usernameLower', '<=', end),
    orderBy('usernameLower'),
    limit(max)
  );
  return onSnapshot(
    q,
    (snap) => {
      const rows: UserSearchHit[] = [];
      for (const d of snap.docs) {
        if (excludeUid && d.id === excludeUid) continue;
        const data = d.data() as Record<string, unknown>;
        rows.push({
          uid: d.id,
          username: String(data.username ?? data.usernameLower ?? 'user').trim() || 'user',
          photoUrl: typeof data.photoUrl === 'string' && data.photoUrl.trim() ? data.photoUrl.trim() : undefined,
        });
      }
      onRows(rows);
    },
    () => onRows([])
  );
}

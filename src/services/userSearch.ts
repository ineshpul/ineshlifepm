import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { usernameToSearchPrefixKey } from '../utils/usernameSearch';

export type UserSearchHit = {
  uid: string;
  username: string;
  photoUrl?: string;
};

function hitFromUserDoc(uid: string, data: Record<string, unknown> | undefined): UserSearchHit {
  return {
    uid,
    username: String(data?.username ?? data?.usernameLower ?? 'user').trim() || 'user',
    photoUrl:
      typeof data?.photoUrl === 'string' && data.photoUrl.trim() ? data.photoUrl.trim() : undefined,
  };
}

/** Exact handle lookup via `usernameClaims/{key}` — works even when `users.usernameLower` is stale. */
async function fetchExactUsernameHit(
  rawPrefix: string,
  excludeUid: string | undefined
): Promise<UserSearchHit | null> {
  const key = usernameToSearchPrefixKey(rawPrefix);
  if (!key) return null;

  const claimSnap = await getDoc(doc(firestore(), 'usernameClaims', key));
  if (!claimSnap.exists()) return null;

  const uid = String(claimSnap.data()?.uid ?? '').trim();
  if (!uid || (excludeUid && uid === excludeUid)) return null;

  const userSnap = await getDoc(doc(firestore(), 'users', uid));
  return hitFromUserDoc(uid, userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : undefined);
}

function mergeSearchHits(exact: UserSearchHit | null, prefixRows: UserSearchHit[], max: number): UserSearchHit[] {
  const out: UserSearchHit[] = [];
  const seen = new Set<string>();
  if (exact) {
    out.push(exact);
    seen.add(exact.uid);
  }
  for (const row of prefixRows) {
    if (seen.has(row.uid)) continue;
    out.push(row);
    seen.add(row.uid);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Prefix search on `users.usernameLower`, plus an exact `usernameClaims` lookup so new
 * accounts are findable even when the profile field lags the claim doc.
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

  let cancelled = false;
  let prefixRows: UserSearchHit[] = [];
  let exactHit: UserSearchHit | null = null;

  const publish = () => {
    if (cancelled) return;
    onRows(mergeSearchHits(exactHit, prefixRows, max));
  };

  void fetchExactUsernameHit(rawPrefix, excludeUid)
    .then((hit) => {
      if (cancelled) return;
      exactHit = hit;
      publish();
    })
    .catch(() => {
      if (cancelled) return;
      exactHit = null;
      publish();
    });

  const end = `${prefix}\uf8ff`;
  const q = query(
    collection(firestore(), 'users'),
    where('usernameLower', '>=', prefix),
    where('usernameLower', '<=', end),
    orderBy('usernameLower'),
    limit(max)
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      if (cancelled) return;
      prefixRows = [];
      for (const d of snap.docs) {
        if (excludeUid && d.id === excludeUid) continue;
        prefixRows.push(hitFromUserDoc(d.id, d.data() as Record<string, unknown>));
      }
      publish();
    },
    () => {
      if (cancelled) return;
      prefixRows = [];
      publish();
    }
  );

  return () => {
    cancelled = true;
    unsub();
  };
}

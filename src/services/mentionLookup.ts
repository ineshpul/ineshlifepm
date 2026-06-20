import { doc, getDoc } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { MentionUser } from '../utils/commentMentions';
import { usernameClaimDocId } from '../utils/usernameSearch';

/** Resolve @handles to account uids via `usernameClaims/{usernameLower}`. */
export async function resolveMentionUsernames(rawUsernames: string[]): Promise<MentionUser[]> {
  if (!isFirebaseConfigured() || !rawUsernames.length) return [];

  const seen = new Set<string>();
  const keys: { key: string; display: string }[] = [];
  for (const raw of rawUsernames) {
    const key = usernameClaimDocId(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push({ key, display: String(raw).replace(/^@+/u, '').trim() || key });
  }

  const resolved: MentionUser[] = [];
  await Promise.all(
    keys.map(async ({ key, display }) => {
      try {
        const snap = await getDoc(doc(firestore(), 'usernameClaims', key));
        if (!snap.exists()) return;
        const uid = String(snap.data()?.uid ?? '').trim();
        if (!uid) return;
        resolved.push({ uid, username: display });
      } catch {
        // ignore lookup failures for invalid handles
      }
    })
  );
  return resolved;
}

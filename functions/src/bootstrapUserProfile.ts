import * as admin from 'firebase-admin';
import * as logger from 'firebase-functions/logger';

import { usernameClaimDocId } from './usernameClaimId';

/**
 * Ensures `users/{uid}` has `username` + `usernameLower` and a matching `usernameClaims` row.
 * Idempotent — skips when the profile is already searchable.
 */
export async function bootstrapUserProfileIfNeeded(
  db: admin.firestore.Firestore,
  args: { uid: string; candidateUsername: string }
): Promise<{ username: string; usernameLower: string; created: boolean }> {
  const uid = args.uid.trim();
  if (!uid) throw new Error('uid required');

  const userRef = db.doc(`users/${uid}`);
  const existing = await userRef.get();
  const existingLower =
    existing.exists && typeof existing.data()?.usernameLower === 'string'
      ? String(existing.data()?.usernameLower).trim()
      : '';
  if (existingLower) {
    const username =
      typeof existing.data()?.username === 'string' && String(existing.data()?.username).trim()
        ? String(existing.data()?.username).trim()
        : existingLower;
    return { username, usernameLower: existingLower, created: false };
  }

  const candidates: string[] = [
    args.candidateUsername.trim() || 'user',
    `user_${uid.slice(-6)}`,
    `leaper_${uid.slice(-8)}`,
    `u_${uid.replace(/[^a-z0-9]/gi, '').slice(0, 12) || uid.slice(-8)}`,
  ];

  let chosenName = candidates[0];
  let key = usernameClaimDocId(chosenName);
  let claimRef = db.doc(`usernameClaims/${key}`);
  let claimSnap = await claimRef.get();

  for (let i = 1; i < candidates.length; i++) {
    if (!claimSnap.exists || String(claimSnap.data()?.uid ?? '') === uid) break;
    chosenName = candidates[i];
    key = usernameClaimDocId(chosenName);
    claimRef = db.doc(`usernameClaims/${key}`);
    claimSnap = await claimRef.get();
  }

  if (claimSnap.exists && String(claimSnap.data()?.uid ?? '') !== uid) {
    chosenName = `u_${uid}`;
    key = usernameClaimDocId(chosenName);
    claimRef = db.doc(`usernameClaims/${key}`);
  }

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    const prevLower =
      userSnap.exists && typeof userSnap.data()?.usernameLower === 'string'
        ? String(userSnap.data()?.usernameLower).trim()
        : '';
    if (prevLower) return;

    const cSnap = await tx.get(claimRef);
    const owner = cSnap.exists ? String(cSnap.data()?.uid ?? '').trim() : '';
    if (cSnap.exists && owner && owner !== uid) {
      throw new Error(`username claim ${key} already owned by ${owner}`);
    }

    tx.set(claimRef, { uid });
    tx.set(
      userRef,
      {
        uid,
        username: chosenName,
        usernameLower: key,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  logger.info('bootstrapped user profile for search', { uid, usernameLower: key });
  return { username: chosenName, usernameLower: key, created: true };
}

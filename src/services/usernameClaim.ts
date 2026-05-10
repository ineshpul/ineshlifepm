import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

import { firebaseAuth, firestore } from '../firebase/firebase';
import { usernameClaimDocId } from '../utils/usernameSearch';

export class UsernameTakenError extends Error {
  readonly code = 'USERNAME_TAKEN';
  constructor() {
    super('That username is already taken.');
    this.name = 'UsernameTakenError';
  }
}

/**
 * Claim `usernameClaims/{usernameLower}` and merge profile fields on `users/{uid}`.
 * Releases the previous claim doc when the normalized username changes.
 */
export async function runUserProfileUsernameTransaction(args: {
  uid: string;
  username: string;
  bio: string;
  extraFields?: Record<string, unknown>;
}): Promise<void> {
  const uid = args.uid;
  const username = args.username.trim() || 'user';
  const key = usernameClaimDocId(username);
  const userRef = doc(firestore(), 'users', uid);
  const claimRef = doc(firestore(), 'usernameClaims', key);

  await runTransaction(firestore(), async (tx) => {
    const userSnap = await tx.get(userRef);
    const prevLower =
      userSnap.exists() && typeof (userSnap.data() as Record<string, unknown>)?.usernameLower === 'string'
        ? String((userSnap.data() as Record<string, unknown>).usernameLower)
        : '';

    const claimSnap = await tx.get(claimRef);
    if (claimSnap.exists()) {
      const owner = (claimSnap.data() as { uid?: string })?.uid;
      if (owner !== uid) throw new UsernameTakenError();
    }

    if (prevLower && prevLower !== key) {
      const prevRef = doc(firestore(), 'usernameClaims', prevLower);
      const prevSnap = await tx.get(prevRef);
      if (prevSnap.exists() && (prevSnap.data() as { uid?: string })?.uid === uid) {
        tx.delete(prevRef);
      }
    }

    tx.set(claimRef, { uid });

    const patch: Record<string, unknown> = {
      uid,
      username,
      usernameLower: key,
      bio: args.bio.trim(),
      updatedAt: serverTimestamp(),
      ...args.extraFields,
    };
    tx.set(userRef, patch, { merge: true });
  });
}

/**
 * First-time / session bootstrap: reserve a claim for `users/{uid}` without colliding with others.
 * Adjusts display username if the preferred normalized key is already taken.
 */
export async function bootstrapUserDocWithUsername(args: {
  uid: string;
  candidateUsername: string;
}): Promise<{ username: string; usernameLower: string }> {
  const uid = args.uid;

  return runTransaction(firestore(), async (transaction) => {
    const userRef = doc(firestore(), 'users', uid);
    const userSnap = await transaction.get(userRef);
    const prevLower =
      userSnap.exists() && typeof (userSnap.data() as Record<string, unknown>)?.usernameLower === 'string'
        ? String((userSnap.data() as Record<string, unknown>).usernameLower)
        : '';

    const candidates: string[] = [
      args.candidateUsername.trim() || 'user',
      `user_${uid.slice(-6)}`,
      `leaper_${uid.slice(-8)}`,
      `u_${uid.replace(/[^a-z0-9]/gi, '').slice(0, 12) || uid.slice(-8)}`,
    ];

    let chosenName = candidates[0];
    let key = usernameClaimDocId(chosenName);
    let claimRef = doc(firestore(), 'usernameClaims', key);
    let claimSnap = await transaction.get(claimRef);

    for (let i = 1; i < candidates.length; i++) {
      if (!claimSnap.exists() || (claimSnap.data() as { uid?: string })?.uid === uid) {
        break;
      }
      chosenName = candidates[i];
      key = usernameClaimDocId(chosenName);
      claimRef = doc(firestore(), 'usernameClaims', key);
      claimSnap = await transaction.get(claimRef);
    }

    if (claimSnap.exists() && (claimSnap.data() as { uid?: string })?.uid !== uid) {
      chosenName = `u_${uid}`;
      key = usernameClaimDocId(chosenName);
      claimRef = doc(firestore(), 'usernameClaims', key);
    }

    if (prevLower && prevLower !== key) {
      const prevRef = doc(firestore(), 'usernameClaims', prevLower);
      const ps = await transaction.get(prevRef);
      if (ps.exists() && (ps.data() as { uid?: string })?.uid === uid) {
        transaction.delete(prevRef);
      }
    }

    transaction.set(claimRef, { uid });
    transaction.set(
      userRef,
      {
        uid,
        username: chosenName,
        usernameLower: key,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return { username: chosenName, usernameLower: key };
  });
}

/** Sync Firebase Auth display name when bootstrap adjusted the username string. */
export async function syncAuthDisplayNameIfNeeded(finalUsername: string): Promise<void> {
  const cur = firebaseAuth().currentUser;
  if (cur && cur.displayName !== finalUsername) {
    const { updateProfile } = await import('firebase/auth');
    await updateProfile(cur, { displayName: finalUsername });
  }
}

/**
 * Inspect specific user docs + Auth display names for username search debugging.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/inspectUsers.js uid1 uid2 ...
 */

import * as admin from 'firebase-admin';

import { usernameClaimDocId } from '../usernameClaimId';

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'leap-e4cce',
});

const db = admin.firestore();
const auth = admin.auth();

async function inspect(uid: string): Promise<void> {
  const [userSnap, authResult] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    auth.getUser(uid).then((u) => ({ ok: true as const, u })).catch((e) => ({ ok: false as const, e })),
  ]);
  const authUser = authResult.ok ? authResult.u : null;
  if (!authResult.ok) {
    console.warn(`auth.getUser(${uid}) failed:`, authResult.e);
  }

  const data = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;
  const username = data && typeof data.username === 'string' ? data.username : null;
  const usernameLower = data && typeof data.usernameLower === 'string' ? data.usernameLower : null;
  const displayName = data && typeof data.displayName === 'string' ? data.displayName : null;

  let claim: { exists: boolean; owner?: string } = { exists: false };
  if (usernameLower) {
    const claimSnap = await db.doc(`usernameClaims/${usernameLower}`).get();
    claim = {
      exists: claimSnap.exists,
      owner: claimSnap.exists ? String(claimSnap.data()?.uid ?? '') : undefined,
    };
  }

  const authDisplay = authUser?.displayName ?? null;
  const authEmail = authUser?.email ?? null;
  const expectedFromAuth = usernameClaimDocId(authDisplay ?? authEmail?.split('@')[0] ?? 'user');

  console.log(
    JSON.stringify(
      {
        uid,
        firestoreData: data,
        authDisplayName: authDisplay,
        firestoreExists: userSnap.exists,
        username,
        usernameLower,
        displayName,
        usernameClaim: claim,
        expectedLowerFromAuth: expectedFromAuth,
        searchable: Boolean(usernameLower),
      },
      null,
      2
    )
  );
}

async function main(): Promise<void> {
  const uids = process.argv.slice(2);
  if (!uids.length) {
    console.error('Pass one or more UIDs');
    process.exit(1);
  }
  for (const uid of uids) {
    await inspect(uid);
    console.log('---');
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

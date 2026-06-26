/**
 * Repair username search fields for specific UIDs (reads displayName from Auth).
 *
 * Usage (from `functions/`):
 *   GOOGLE_CLOUD_PROJECT=leap-e4cce npm run build && node lib/scripts/repairUserSearch.js uid1 uid2
 *   ... --execute   # apply (default is dry-run)
 */

import * as admin from 'firebase-admin';

import { bootstrapUserProfileIfNeeded } from '../bootstrapUserProfile';

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'leap-e4cce',
});

const db = admin.firestore();
const auth = admin.auth();

async function repair(uid: string, execute: boolean): Promise<void> {
  const [userSnap, authUser] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    auth.getUser(uid),
  ]);

  const data = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : null;
  const existingLower =
    data && typeof data.usernameLower === 'string' ? String(data.usernameLower).trim() : '';

  const candidate =
    (typeof data?.username === 'string' && data.username.trim()) ||
    authUser.displayName?.trim() ||
    authUser.email?.split('@')[0]?.trim() ||
    `user_${uid.slice(-6)}`;

  const line = {
    uid,
    email: authUser.email ?? null,
    authDisplayName: authUser.displayName ?? null,
    existingUsernameLower: existingLower || null,
    candidate,
    firestoreExists: userSnap.exists,
  };

  if (existingLower) {
    console.log(JSON.stringify({ ...line, action: 'skip_already_searchable' }));
    return;
  }

  if (!execute) {
    console.log(JSON.stringify({ ...line, action: 'dry_run_would_fix' }));
    return;
  }

  const result = await bootstrapUserProfileIfNeeded(db, { uid, candidateUsername: candidate });
  console.log(JSON.stringify({ ...line, action: 'fixed', result }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--execute');
  const execute = process.argv.includes('--execute');
  if (!args.length) {
    console.error('Pass one or more UIDs. Add --execute to apply.');
    process.exit(1);
  }
  for (const uid of args) {
    await repair(uid, execute);
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

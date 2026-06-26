/**
 * Backfill `users.usernameLower` + `usernameClaims` for accounts missing searchable handles.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/backfillUsernameLower.js              # dry-run
 *   npm run build && node lib/scripts/backfillUsernameLower.js --execute    # apply
 */

import * as admin from 'firebase-admin';

import { bootstrapUserProfileIfNeeded } from '../bootstrapUserProfile';

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'leap-e4cce',
});

const db = admin.firestore();
const auth = admin.auth();

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const dryRun = !execute;

  let scanned = 0;
  let needsFix = 0;
  let fixed = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(200);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      scanned += 1;
      const data = doc.data();
      const usernameLower =
        typeof data.usernameLower === 'string' ? String(data.usernameLower).trim() : '';
      if (usernameLower) continue;

      needsFix += 1;
      let authDisplay = '';
      try {
        const authUser = await auth.getUser(doc.id);
        authDisplay = authUser.displayName?.trim() || authUser.email?.split('@')[0]?.trim() || '';
      } catch {
        // Auth row missing — fall through to Firestore / uid suffix.
      }

      const candidate =
        (typeof data.username === 'string' && data.username.trim()) ||
        (typeof data.displayName === 'string' && data.displayName.trim()) ||
        authDisplay ||
        `user_${doc.id.slice(-6)}`;

      console.log(`${dryRun ? '[dry-run] ' : ''}fix ${doc.id} → candidate "${candidate}"`);

      if (!dryRun) {
        try {
          await bootstrapUserProfileIfNeeded(db, { uid: doc.id, candidateUsername: candidate });
          fixed += 1;
        } catch (e) {
          console.warn(`failed ${doc.id}:`, e);
        }
      }
    }

    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < 200) break;
  }

  console.log(
    JSON.stringify({ dryRun, scanned, needsFix, fixed }, null, 2)
  );
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

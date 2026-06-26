/**
 * One-off: find Firestore `users` with the same normalized username, keep the highest
 * `verticalScore` (then `leaperLifetimePoints`), delete the rest (Auth + user doc subtree + related docs).
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/dedupeUsernames.js              # dry-run (default)
 *   npm run build && node lib/scripts/dedupeUsernames.js --execute    # actually delete
 *
 * Requires Application Default Credentials (e.g. `gcloud auth application-default login`
 * or `GOOGLE_APPLICATION_CREDENTIALS` to a service account with Firebase Admin).
 *
 * Skips groups whose normalized key is `user` (too risky — many legit defaults).
 */

import * as admin from 'firebase-admin';

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'leap-e4cce',
});

const db = admin.firestore();
const auth = admin.auth();

function usernameClaimDocId(raw: string): string {
  let s = String(raw ?? '')
    .trim()
    .replace(/^@+/u, '')
    .toLowerCase();
  s = s.replace(/\s+/g, '_');
  s = s.replace(/[^a-z0-9_]/g, '_');
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!s) s = 'user';
  return s.length > 40 ? s.slice(0, 40) : s;
}

function activityScore(data: FirebaseFirestore.DocumentData | undefined): number {
  if (!data) return 0;
  const vs = Number(data.verticalScore ?? 0);
  const life = Number(data.leaperLifetimePoints ?? 0);
  const challenges = Number(data.challengesCompleted ?? 0);
  const streak = Number(data.activeLeapStreakDays ?? 0);
  const updatedMs =
    typeof data.updatedAt?.toMillis === 'function' ? (data.updatedAt as FirebaseFirestore.Timestamp).toMillis() : 0;
  return vs * 1e15 + life * 1e9 + challenges * 1e6 + streak * 1e3 + updatedMs;
}

/** @deprecated use {@link activityScore} */
function score(data: FirebaseFirestore.DocumentData | undefined): number {
  return activityScore(data);
}

function normalizedKeyForUser(data: FirebaseFirestore.DocumentData | undefined): string {
  const lower =
    typeof data?.usernameLower === 'string' && String(data.usernameLower).trim()
      ? String(data.usernameLower).trim()
      : '';
  if (lower) return lower;
  const username = String(data?.username ?? '').trim() || 'user';
  return usernameClaimDocId(username);
}

async function deleteQueryInBatches(
  q: FirebaseFirestore.Query,
  batchSize = 400
): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await q.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const d of snap.docs) {
      batch.delete(d.ref);
      deleted += 1;
    }
    await batch.commit();
    if (snap.size < batchSize) break;
  }
  return deleted;
}

async function deleteUsernameClaimIfOwned(uid: string, usernameLower: string | undefined): Promise<void> {
  if (!usernameLower || typeof usernameLower !== 'string') return;
  const ref = db.collection('usernameClaims').doc(usernameLower);
  const snap = await ref.get();
  if (!snap.exists) return;
  const owner = snap.data()?.uid;
  if (owner === uid) await ref.delete();
}

async function deleteUserDocTree(uid: string): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const cols = await userRef.listCollections();
  for (const col of cols) {
    const snap = await col.get();
    for (const d of snap.docs) {
      await d.ref.delete();
    }
  }
  await userRef.delete();
}

async function purgeUid(uid: string, userData: FirebaseFirestore.DocumentData | undefined): Promise<void> {
  await deleteUsernameClaimIfOwned(uid, userData?.usernameLower as string | undefined);

  await deleteQueryInBatches(db.collection('videos').where('uid', '==', uid));
  await deleteQueryInBatches(db.collection('postAttempts').where('uid', '==', uid));

  await deleteUserDocTree(uid);

  try {
    await auth.deleteUser(uid);
  } catch (e: unknown) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    if (code !== 'auth/user-not-found') console.warn(`auth.deleteUser(${uid}):`, e);
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const dryRun = !execute;

  console.log(dryRun ? 'DRY RUN (pass --execute to delete)\n' : 'EXECUTING DELETES\n');

  const snap = await db.collection('users').get();
  const byKey = new Map<string, { id: string; data: FirebaseFirestore.DocumentData }[]>();

  for (const d of snap.docs) {
    const key = normalizedKeyForUser(d.data());
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ id: d.id, data: d.data() });
  }

  let duplicateGroups = 0;
  let accountsRemoved = 0;

  for (const [key, group] of byKey) {
    if (group.length < 2) continue;

    if (key === 'user') {
      console.warn(`Skipping ${group.length} docs with normalized key "user" — inspect manually.`);
      continue;
    }

    group.sort((a, b) => activityScore(b.data) - activityScore(a.data));
    const winner = group[0];
    const rest = group.slice(1);

    duplicateGroups += 1;
    console.log(
      `[${key}] keep ${winner.id} (activity=${activityScore(winner.data).toFixed(0)} username=${winner.data?.username ?? '?'})`
    );
    for (const l of rest) {
      console.log(
        `    drop ${l.id} (activity=${activityScore(l.data).toFixed(0)} username=${l.data?.username ?? '?'})`
      );
      accountsRemoved += 1;
      if (!dryRun) {
        await purgeUid(l.id, l.data);
      }
    }
  }

  console.log(
    `\nDone. Duplicate username groups: ${duplicateGroups}, accounts removed: ${accountsRemoved}${dryRun ? ' (dry-run)' : ''}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

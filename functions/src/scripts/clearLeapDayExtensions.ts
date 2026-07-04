/**
 * Remove leap-day extension grants (revert to normal challenge window).
 *
 *   $env:USER_UIDS = "uid1,uid2"   # optional — clears all if omitted
 *   npm run clear:leap-extension
 */

import * as admin from 'firebase-admin';

const DEFAULT_PROJECT =
  process.env.GCLOUD_PROJECT ||
  process.env.GCP_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  'leap-e4cce';

async function main(): Promise<void> {
  const rawUids = String(process.env.USER_UIDS ?? '').trim();
  const uids = rawUids
    ? rawUids.split(',').map((u) => u.trim()).filter(Boolean)
    : null;

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: DEFAULT_PROJECT });
  }
  const db = admin.firestore();
  const grantRef = db.doc('config/leapDayExtensions');
  const grantSnap = await grantRef.get();
  const byUid = { ...(grantSnap.data()?.byUid as Record<string, unknown> | undefined) };

  const removed: string[] = [];
  if (uids) {
    for (const uid of uids) {
      if (byUid[uid] != null) {
        delete byUid[uid];
        removed.push(uid);
      }
    }
  } else {
    for (const uid of Object.keys(byUid)) {
      delete byUid[uid];
      removed.push(uid);
    }
  }

  await grantRef.set(
    { byUid, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  console.log(JSON.stringify({ ok: true, removed, remaining: Object.keys(byUid) }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

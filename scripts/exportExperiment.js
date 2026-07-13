/**
 * Export feed-gate experiment cohort metrics to CSV (Excel-ready).
 *
 * Usage (from repo root):
 *   node scripts/exportExperiment.js [outputPath]
 *
 * Requires Firebase Admin credentials (gcloud auth application-default login
 * or GOOGLE_APPLICATION_CREDENTIALS). Uses firebase-admin from functions/.
 */

const fs = require('fs');
const path = require('path');

const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'leap-e4cce';

if (!admin.apps.length) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const db = admin.firestore();
const auth = admin.auth();

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function tsToIso(raw) {
  if (!raw) return '';
  if (typeof raw.toDate === 'function') return raw.toDate().toISOString();
  if (typeof raw === 'string') return raw;
  return '';
}

async function loadCreationTimes(uids) {
  const map = new Map();
  const chunk = 100;
  for (let i = 0; i < uids.length; i += chunk) {
    const slice = uids.slice(i, i + chunk);
    const results = await Promise.all(
      slice.map(async (uid) => {
        try {
          const u = await auth.getUser(uid);
          return [uid, u.metadata.creationTime || ''];
        } catch {
          return [uid, ''];
        }
      })
    );
    for (const [uid, created] of results) map.set(uid, created);
  }
  return map;
}

async function countPosts(uid) {
  const snap = await db.collection('videos').where('uid', '==', uid).count().get();
  return snap.data().count;
}

async function main() {
  const outPath = path.resolve(
    process.argv[2] || path.join(__dirname, '..', 'experiment-export.csv')
  );

  const usersSnap = await db
    .collection('users')
    .where('experimentCohort', 'in', ['gate_on', 'gate_off'])
    .get();

  const rows = [];
  const uids = [];

  for (const doc of usersSnap.docs) {
    const d = doc.data() || {};
    if (!d.experimentAssignedAt) continue;
    if (d.experimentCohort !== 'gate_on' && d.experimentCohort !== 'gate_off') continue;
    uids.push(doc.id);
    rows.push({
      uid: doc.id,
      cohort: d.experimentCohort,
      experimentAssignedAt: d.experimentAssignedAt,
      day1: d.experimentDay1Returned === true ? 1 : 0,
      day7: d.experimentDay7Returned === true ? 1 : 0,
      sessionSeconds: Number(d.experimentTotalSessionSeconds || 0) || 0,
    });
  }

  const creation = await loadCreationTimes(uids);

  const header = [
    'uid',
    'cohort',
    'signup_date',
    'total_posts',
    'posted_at_least_once',
    'day_1_returned',
    'day_7_returned',
    'total_session_seconds',
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    const totalPosts = await countPosts(row.uid);
    const signup = creation.get(row.uid) || tsToIso(row.experimentAssignedAt);
    lines.push(
      [
        csvEscape(row.uid),
        csvEscape(row.cohort),
        csvEscape(signup),
        csvEscape(totalPosts),
        csvEscape(totalPosts > 0 ? 1 : 0),
        csvEscape(row.day1),
        csvEscape(row.day7),
        csvEscape(row.sessionSeconds),
      ].join(',')
    );
  }

  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8');
  console.log(`Exported ${rows.length} experiment users → ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

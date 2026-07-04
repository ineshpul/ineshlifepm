/**
 * Export daily challenge titles + approved post counts + registered user totals to CSV and Excel.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/exportChallengePostStats.js [outputDir]
 *   npm run export:challenge-posts -- --no-open
 *
 * Requires Firebase Admin credentials (gcloud auth application-default login
 * or GOOGLE_APPLICATION_CREDENTIALS).
 */

import * as fs from 'fs';
import * as path from 'path';

import * as admin from 'firebase-admin';

import {
  buildChallengePostStatsCsv,
  buildChallengePostStatsExport,
  buildChallengePostStatsXlsx,
  DEFAULT_STORAGE_BUCKET,
  uploadChallengePostStatsExport,
} from '../exportChallengePostStatsCore';
import {
  challengePostStatsXlsxPath,
  openChallengePostStatsXlsx,
  printOpenInstructions,
} from './openChallengePostStatsFile';

admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'leap-e4cce',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || DEFAULT_STORAGE_BUCKET,
});

const db = admin.firestore();
const auth = admin.auth();

async function main(): Promise<void> {
  const upload = process.argv.includes('--upload');
  const shouldOpen = !process.argv.includes('--no-open');
  const args = process.argv.slice(2).filter((a) => a !== '--upload' && a !== '--no-open');
  const outputDir = path.resolve(args[0] || path.join(process.cwd(), '..'));
  fs.mkdirSync(outputDir, { recursive: true });

  const exportData = await buildChallengePostStatsExport(db, auth);

  const csvPath = path.join(outputDir, 'challenge-daily-posts.csv');
  const xlsxPath = challengePostStatsXlsxPath(outputDir);

  fs.writeFileSync(csvPath, buildChallengePostStatsCsv(exportData.rows));
  fs.writeFileSync(xlsxPath, buildChallengePostStatsXlsx(exportData.rows));

  console.log(`Exported ${exportData.rows.length} days (${exportData.totalPosts} total posts)`);
  console.log(`CSV:   ${csvPath}`);
  console.log(`Excel: ${xlsxPath}`);

  if (upload) {
    const remote = await uploadChallengePostStatsExport(db, auth);
    console.log('Uploaded to Cloud Storage:', remote);
  }

  printOpenInstructions(xlsxPath);

  if (shouldOpen) {
    try {
      await openChallengePostStatsXlsx(xlsxPath);
      console.log('Opened Excel.');
    } catch {
      /* instructions already printed */
    }
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Download the latest challenge stats export from Cloud Storage to disk.
 *
 * Usage (from `functions/`):
 *   npm run build && node lib/scripts/downloadChallengePostStats.js [outputDir]
 *   npm run download:challenge-posts -- --no-open
 */

import * as fs from 'fs';
import * as path from 'path';

import * as admin from 'firebase-admin';

import {
  CHALLENGE_POST_STATS_CSV_PATH,
  CHALLENGE_POST_STATS_XLSX_PATH,
  DEFAULT_STORAGE_BUCKET,
  challengePostStatsBucket,
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

async function main(): Promise<void> {
  const shouldOpen = !process.argv.includes('--no-open');
  const args = process.argv.slice(2).filter((a) => a !== '--no-open');
  const outputDir = path.resolve(args[0] || path.join(process.cwd(), '..'));
  fs.mkdirSync(outputDir, { recursive: true });

  const bucket = challengePostStatsBucket();
  const xlsxOut = challengePostStatsXlsxPath(outputDir);
  const csvOut = path.join(outputDir, 'challenge-daily-posts.csv');

  const [xlsxBuf] = await bucket.file(CHALLENGE_POST_STATS_XLSX_PATH).download();
  const [csvBuf] = await bucket.file(CHALLENGE_POST_STATS_CSV_PATH).download();

  fs.writeFileSync(xlsxOut, xlsxBuf);
  fs.writeFileSync(csvOut, csvBuf);

  console.log('Downloaded from Cloud Storage:');
  console.log(`  Excel: ${xlsxOut}`);
  console.log(`  CSV:   ${csvOut}`);

  printOpenInstructions(xlsxOut);

  if (shouldOpen) {
    try {
      await openChallengePostStatsXlsx(xlsxOut);
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

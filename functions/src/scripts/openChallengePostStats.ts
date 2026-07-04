/**
 * Open the local challenge stats Excel file in the default app (Excel).
 *
 * Usage (from `functions/`):
 *   npm run open:challenge-posts
 */

import * as path from 'path';

import {
  challengePostStatsXlsxPath,
  openChallengePostStatsXlsx,
  printOpenInstructions,
} from './openChallengePostStatsFile';

async function main(): Promise<void> {
  const outputDir = path.resolve(process.argv[2] || path.join(process.cwd(), '..'));
  const xlsxPath = challengePostStatsXlsxPath(outputDir);

  printOpenInstructions(xlsxPath);
  await openChallengePostStatsXlsx(xlsxPath);
  console.log('Opened Excel.');
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});

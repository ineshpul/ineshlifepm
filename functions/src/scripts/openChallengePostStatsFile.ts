import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function challengePostStatsXlsxPath(outputDir: string): string {
  return path.join(outputDir, 'challenge-daily-posts.xlsx');
}

export function fileUriForPath(filePath: string): string {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

export async function openChallengePostStatsXlsx(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const platform = process.platform;
  try {
    if (platform === 'win32') {
      await execFileAsync('cmd.exe', ['/c', 'start', '', resolved], { windowsHide: true });
      return;
    }
    if (platform === 'darwin') {
      await execFileAsync('open', [resolved]);
      return;
    }
    await execFileAsync('xdg-open', [resolved]);
  } catch (error) {
    console.warn('Could not auto-open Excel. Open manually:');
    console.warn(`  ${resolved}`);
    console.warn(`  ${fileUriForPath(resolved)}`);
    throw error;
  }
}

export function printOpenInstructions(filePath: string): void {
  const resolved = path.resolve(filePath);
  console.log('');
  console.log('Open in Excel:');
  console.log(`  ${resolved}`);
  console.log(`  ${fileUriForPath(resolved)}`);
  console.log('');
  console.log('PowerShell:');
  console.log(`  Start-Process "${resolved}"`);
}

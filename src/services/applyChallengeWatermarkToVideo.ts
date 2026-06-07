import * as FileSystem from 'expo-file-system/legacy';
import ExpoVideoWatermark from '@stefanmartin/expo-video-watermark';

import {
  captureChallengeWatermarkPng,
  type ChallengeWatermarkInfo,
} from './challengeWatermarkCapture';

function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

async function cleanupTempFile(uri: string | undefined): Promise<void> {
  if (!uri) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* noop */
  }
}

/** Burns a challenge banner PNG onto a local copy for camera-roll export only. */
export async function applyChallengeWatermarkToVideo(
  videoUri: string,
  challenge: ChallengeWatermarkInfo
): Promise<string> {
  const sourcePath = stripFileScheme(videoUri);
  const watermarkPath = stripFileScheme(await captureChallengeWatermarkPng(challenge));
  const outputPath = stripFileScheme(
    `${FileSystem.cacheDirectory}leap-watermarked-${Date.now()}.mp4`
  );

  try {
    const result = await ExpoVideoWatermark.watermarkVideo(sourcePath, watermarkPath, outputPath);
    return result.startsWith('file://') ? result : `file://${result}`;
  } finally {
    await cleanupTempFile(watermarkPath);
  }
}

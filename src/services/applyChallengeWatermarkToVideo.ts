import * as FileSystem from 'expo-file-system/legacy';

import {
  captureChallengeWatermarkPng,
  type ChallengeWatermarkInfo,
} from './challengeWatermarkCapture';
import { getVideoRenderSize, watermarkVideo } from './expoVideoWatermark';

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

/** Burns the Leap watermark PNG onto a local copy for camera-roll export only. */
export async function applyChallengeWatermarkToVideo(
  videoUri: string,
  challenge: Pick<ChallengeWatermarkInfo, 'title' | 'username'>
): Promise<string> {
  const sourcePath = stripFileScheme(videoUri);
  const { width, height } = await getVideoRenderSize(videoUri);
  const watermarkPath = stripFileScheme(
    await captureChallengeWatermarkPng({
      title: challenge.title,
      username: challenge.username,
      width,
      height,
    })
  );
  const outputPath = stripFileScheme(
    `${FileSystem.cacheDirectory}leap-watermarked-${Date.now()}.mp4`
  );

  try {
    const result = await watermarkVideo(sourcePath, watermarkPath, outputPath);
    return result.startsWith('file://') ? result : `file://${result}`;
  } finally {
    await cleanupTempFile(watermarkPath);
  }
}

import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { applyChallengeWatermarkToVideo } from './applyChallengeWatermarkToVideo';
import type { ChallengeWatermarkInfo } from './challengeWatermarkCapture';

const VIDEO_EXT = /\.(mp4|mov|m4v)$/i;

/** Stable copy for the post-save banner (survives cache cleanup). */
export async function stageVideoForCameraRollOffer(sourceUri: string): Promise<string> {
  if (!sourceUri || sourceUri.startsWith('demo://')) {
    throw new Error('No video to save.');
  }
  const src = await FileSystem.getInfoAsync(sourceUri);
  if (!src.exists) {
    throw new Error('Recording file is no longer on this device.');
  }
  const dest = `${FileSystem.documentDirectory}leap-camera-roll-pending.mp4`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

async function uriReadyForPhotoLibrary(uri: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    throw new Error(
      'This recording is no longer on your device. Record again if you want a camera roll copy.'
    );
  }
  if (VIDEO_EXT.test(uri)) return uri;

  const dest = `${FileSystem.cacheDirectory}leap-save-${Date.now()}.mp4`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

async function cleanupTempFile(uri: string | undefined): Promise<void> {
  if (!uri || uri.includes('leap-camera-roll-pending')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* noop */
  }
}

async function downloadRemoteVideo(url: string): Promise<string> {
  const dest = `${FileSystem.cacheDirectory}leap-share-save-${Date.now()}.mp4`;
  const result = await FileSystem.downloadAsync(url, dest);
  if (result.status !== 200) {
    throw new Error('Could not download the video. Check your connection and try again.');
  }
  return result.uri;
}

/** Save a feed or chat video URL (remote or local) to the camera roll. */
export async function saveRemoteVideoToCameraRoll(
  videoUrl: string,
  challenge?: ChallengeWatermarkInfo
): Promise<void> {
  const trimmed = videoUrl.trim();
  if (!trimmed || trimmed.startsWith('demo://')) {
    throw new Error('No video to save.');
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    await saveVideoToCameraRoll(trimmed, challenge);
    return;
  }

  const localUri = await downloadRemoteVideo(trimmed);
  try {
    await saveVideoToCameraRoll(localUri, challenge);
  } finally {
    await cleanupTempFile(localUri);
  }
}

/** Camera-roll export — burns in the leap prompt when challenge info is provided. */
export async function saveVideoToCameraRoll(
  uri: string,
  challenge?: ChallengeWatermarkInfo
): Promise<void> {
  if (!uri || uri.startsWith('demo://')) {
    throw new Error('No video to save.');
  }

  const existing = await MediaLibrary.getPermissionsAsync(true);
  const p = existing.granted ? existing : await MediaLibrary.requestPermissionsAsync(true);
  if (!p.granted) {
    throw new Error('Photo library access was not granted. You can allow it in Settings.');
  }

  let localUri = await uriReadyForPhotoLibrary(uri);
  let watermarkedUri: string | undefined;

  if (challenge?.title?.trim()) {
    watermarkedUri = await applyChallengeWatermarkToVideo(localUri, {
      title: challenge.title.trim(),
      username: challenge.username?.trim() || 'user',
    });
    localUri = watermarkedUri;
  }

  try {
    await MediaLibrary.saveToLibraryAsync(localUri);
  } finally {
    await cleanupTempFile(watermarkedUri);
  }
}

/** Remove app-staged copy after save/dismiss (best-effort). */
export async function cleanupStagedCameraRollFile(uri: string): Promise<void> {
  if (!uri.includes('leap-camera-roll-pending')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* noop */
  }
}

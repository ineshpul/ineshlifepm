import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

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

export async function saveVideoToCameraRoll(uri: string): Promise<void> {
  if (!uri || uri.startsWith('demo://')) {
    throw new Error('No video to save.');
  }

  const p = await MediaLibrary.requestPermissionsAsync();
  if (!p.granted) {
    throw new Error('Photo library access was not granted. You can allow it in Settings.');
  }

  const localUri = await uriReadyForPhotoLibrary(uri);
  await MediaLibrary.saveToLibraryAsync(localUri);
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

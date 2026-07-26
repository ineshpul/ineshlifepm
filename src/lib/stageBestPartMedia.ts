import * as FileSystem from 'expo-file-system/legacy';

import type { BestPartMediaType } from '../types/bestPart';

/** Stable on-device copy so upload survives capture-screen unmount / temp cleanup. */
export async function stageBestPartMedia(
  sourceUri: string,
  tag: 'primary' | 'pip',
  mediaType: BestPartMediaType
): Promise<string> {
  if (!sourceUri) throw new Error('No media to stage.');
  const src = await FileSystem.getInfoAsync(sourceUri);
  if (!src.exists) {
    throw new Error('Capture file is no longer on this device.');
  }
  const ext = mediaType === 'photo' ? 'jpg' : 'mp4';
  const dest = `${FileSystem.documentDirectory}best-part-${tag}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function cleanupStagedBestPartMedia(): Promise<void> {
  for (const tag of ['primary', 'pip'] as const) {
    for (const ext of ['jpg', 'mp4'] as const) {
      const path = `${FileSystem.documentDirectory}best-part-${tag}.${ext}`;
      try {
        await FileSystem.deleteAsync(path, { idempotent: true });
      } catch {
        /* noop */
      }
    }
  }
}

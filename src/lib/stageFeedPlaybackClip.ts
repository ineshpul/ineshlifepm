import * as FileSystem from 'expo-file-system/legacy';

/** Stable on-device copy so feed playback survives camera temp cleanup after post. */
export async function stageFeedPlaybackClip(sourceUri: string, tag: 'primary' | 'pip'): Promise<string> {
  if (!sourceUri || sourceUri.startsWith('demo://')) {
    throw new Error('No video to stage.');
  }
  const src = await FileSystem.getInfoAsync(sourceUri);
  if (!src.exists) {
    throw new Error('Recording file is no longer on this device.');
  }
  const dest = `${FileSystem.documentDirectory}leap-feed-playback-${tag}.mp4`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function cleanupStagedFeedPlaybackClips(): Promise<void> {
  for (const tag of ['primary', 'pip'] as const) {
    const path = `${FileSystem.documentDirectory}leap-feed-playback-${tag}.mp4`;
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      /* noop */
    }
  }
}

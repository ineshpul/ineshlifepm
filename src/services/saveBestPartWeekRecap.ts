import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { applyChallengeWatermarkToVideo } from './applyChallengeWatermarkToVideo';
import { ensureWeekRecapLocalUri } from './bestPartWeekRecapCache';
import { canConcatVideosNatively, concatVideos } from './concatVideos';

async function cleanupTempFile(uri: string | undefined): Promise<void> {
  if (!uri) return;
  // Prefetch cache is shared with playback — don't delete those files after export.
  if (uri.includes('leap-week-prefetch-')) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* noop */
  }
}

async function localVideoUri(url: string): Promise<{ uri: string; isTemp: boolean }> {
  const trimmed = url.trim();
  if (!trimmed) throw new Error('Missing video.');
  if (!/^https?:\/\//i.test(trimmed)) return { uri: trimmed, isTemp: false };
  // Reuse playback prefetch cache when present.
  const uri = await ensureWeekRecapLocalUri(trimmed);
  return { uri, isTemp: true };
}

export type WeekRecapClip = {
  mediaType: 'photo' | 'video';
  url: string;
  feedUrl?: string;
};

/**
 * Builds a camera-roll export of this week’s video moments with
 * “Your week w/ Leap” + logo + @username watermark.
 */
export async function saveBestPartWeekRecapToCameraRoll(args: {
  clips: WeekRecapClip[];
  username: string;
}): Promise<{ clipCount: number; stitched: boolean }> {
  const videos = args.clips
    .filter((c) => c.mediaType === 'video')
    .map((c) => (c.feedUrl || c.url).trim())
    .filter(Boolean);

  if (videos.length === 0) {
    throw new Error('Add at least one video moment this week to download a recap.');
  }

  const existing = await MediaLibrary.getPermissionsAsync(true);
  const perm = existing.granted ? existing : await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) {
    throw new Error('Photo library access was not granted. You can allow it in Settings.');
  }

  const challenge = {
    title: 'Your week w/ Leap',
    username: args.username.trim() || 'user',
    variant: 'bestPart' as const,
  };

  const locals: Array<{ uri: string; isTemp: boolean }> = [];
  const tempsToClean: string[] = [];

  try {
    for (const url of videos) {
      const local = await localVideoUri(url);
      locals.push(local);
      if (local.isTemp) tempsToClean.push(local.uri);
    }

    const uris = locals.map((l) => l.uri);

    if (uris.length === 1) {
      const watermarked = await applyChallengeWatermarkToVideo(uris[0]!, challenge);
      tempsToClean.push(watermarked);
      await MediaLibrary.saveToLibraryAsync(watermarked);
      return { clipCount: 1, stitched: false };
    }

    if (canConcatVideosNatively()) {
      const staged = await concatVideos(uris);
      tempsToClean.push(staged);
      const watermarked = await applyChallengeWatermarkToVideo(staged, challenge);
      tempsToClean.push(watermarked);
      await MediaLibrary.saveToLibraryAsync(watermarked);
      return { clipCount: uris.length, stitched: true };
    }

    // Older binary without concat — save each moment with the week watermark.
    for (const uri of uris) {
      const watermarked = await applyChallengeWatermarkToVideo(uri, challenge);
      tempsToClean.push(watermarked);
      await MediaLibrary.saveToLibraryAsync(watermarked);
    }
    return { clipCount: uris.length, stitched: false };
  } finally {
    await Promise.all(tempsToClean.map((uri) => cleanupTempFile(uri)));
  }
}

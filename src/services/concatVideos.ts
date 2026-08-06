import ExpoVideoWatermark from '@stefanmartin/expo-video-watermark';
import * as FileSystem from 'expo-file-system/legacy';

type NativeConcat = typeof ExpoVideoWatermark & {
  concatVideos?: (videoPaths: string[], outputPath: string) => Promise<string>;
};

const native = ExpoVideoWatermark as NativeConcat;

function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

function withFileScheme(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

/** True when the installed binary exposes native multi-clip concat. */
export function canConcatVideosNatively(): boolean {
  return typeof native.concatVideos === 'function';
}

/**
 * Mid-record camera flip splits a take into segments that must be stitched.
 *
 * The native concat inserts every segment into ONE composition track and assigns
 * `preferredTransform` inside the loop, so the last segment's transform wins for
 * the whole track — and it never builds an `AVMutableVideoComposition` with a
 * fixed renderSize and per-segment layer instructions. Front and back segments
 * carry different transforms (and can differ in dimensions), so a flipped take
 * exports malformed: AVKit refuses the item and paints its crossed-out play
 * placeholder, with neither video nor audio.
 *
 * Straight (unflipped) takes never enter this path, which is why only some posts
 * break. Week-recap stitching still uses {@link canConcatVideosNatively} — those
 * clips share one orientation, so they compose correctly.
 *
 * Re-enable once the native concat sets a proper videoComposition. That is a
 * native change and needs a new build, not an OTA update.
 */
export function canFlipMidRecording(): boolean {
  return false;
}

/**
 * Stitch local MP4 segments end-to-end (mid-record camera flips).
 * Requires a native build that includes `concatVideos` on ExpoVideoWatermark.
 */
export async function concatVideos(segmentUris: string[]): Promise<string> {
  const uris = segmentUris.filter((u) => typeof u === 'string' && u.trim().length > 0);
  if (uris.length === 0) {
    throw new Error('No video segments to join.');
  }
  if (uris.length === 1) {
    return withFileScheme(uris[0]);
  }
  if (typeof native.concatVideos !== 'function') {
    throw new Error('Video flip stitch requires a newer app build.');
  }

  const dir = FileSystem.cacheDirectory;
  if (!dir) {
    throw new Error('No cache directory for stitched video.');
  }
  const outputPath = `${stripFileScheme(dir)}leap-flip-${Date.now()}.mp4`;
  const paths = uris.map(stripFileScheme);
  const result = await native.concatVideos(paths, outputPath);
  return withFileScheme(result);
}

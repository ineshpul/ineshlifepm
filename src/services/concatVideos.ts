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

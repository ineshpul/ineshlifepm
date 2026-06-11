import ExpoVideoWatermark from '@stefanmartin/expo-video-watermark';

import { DEFAULT_WATERMARK_FRAME } from './videoWatermarkLayout';

export type VideoRenderSize = {
  width: number;
  height: number;
};

type NativeVideoWatermark = typeof ExpoVideoWatermark & {
  getVideoRenderSize?: (videoPath: string) => Promise<{ width: number; height: number }>;
};

const native = ExpoVideoWatermark as NativeVideoWatermark;

function stripFileScheme(uri: string): string {
  return uri.startsWith('file://') ? uri.slice('file://'.length) : uri;
}

/** Upright render dimensions for a local video file (rotation-aware). */
export async function getVideoRenderSize(videoUri: string): Promise<VideoRenderSize> {
  const videoPath = stripFileScheme(videoUri);
  if (typeof native.getVideoRenderSize === 'function') {
    const size = await native.getVideoRenderSize(videoPath);
    const width = Math.round(Number(size.width));
    const height = Math.round(Number(size.height));
    if (width > 0 && height > 0) {
      return { width, height };
    }
  }
  return DEFAULT_WATERMARK_FRAME;
}

export async function watermarkVideo(
  videoPath: string,
  imagePath: string,
  outputPath: string
): Promise<string> {
  return native.watermarkVideo(videoPath, imagePath, outputPath);
}

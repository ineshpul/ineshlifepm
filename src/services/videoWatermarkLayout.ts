/** Reference frame for proportional watermark sizing (9:16 portrait). */
const REF_WIDTH = 1080;
const REF_HEIGHT = 1920;

function scaleByHeight(height: number, px: number): number {
  return (height * px) / REF_HEIGHT;
}

function scaleByWidth(width: number, px: number): number {
  return (width * px) / REF_WIDTH;
}

export type VideoWatermarkLayout = {
  width: number;
  height: number;
  pill: {
    height: number;
    insetTop: number;
    insetRight: number;
    paddingHorizontal: number;
    gap: number;
    logoHeight: number;
    wordmarkSize: number;
    borderRadius: number;
  };
  strip: {
    height: number;
    gradientHeight: number;
    paddingHorizontal: number;
    paddingBottom: number;
    promptSize: number;
    promptLineHeight: number;
    metaSize: number;
    metaLineHeight: number;
    metaMarginTop: number;
  };
};

/** Pixel layout for a watermark PNG at the given export resolution. */
export function computeVideoWatermarkLayout(width: number, height: number): VideoWatermarkLayout {
  const pillHeight = scaleByHeight(height, 72);
  return {
    width,
    height,
    pill: {
      height: pillHeight,
      insetTop: scaleByHeight(height, 40),
      insetRight: scaleByHeight(height, 40),
      paddingHorizontal: scaleByHeight(height, 14),
      gap: scaleByHeight(height, 8),
      logoHeight: scaleByHeight(height, 44),
      wordmarkSize: scaleByHeight(height, 34),
      borderRadius: pillHeight / 2,
    },
    strip: {
      height: scaleByHeight(height, 150),
      gradientHeight: scaleByHeight(height, 60),
      paddingHorizontal: scaleByWidth(width, 32),
      paddingBottom: scaleByHeight(height, 32),
      promptSize: scaleByHeight(height, 48),
      promptLineHeight: scaleByHeight(height, 52),
      metaSize: scaleByHeight(height, 32),
      metaLineHeight: scaleByHeight(height, 36),
      metaMarginTop: scaleByHeight(height, 6),
    },
  };
}

/** Default portrait size when native render dimensions are unavailable. */
export const DEFAULT_WATERMARK_FRAME = { width: REF_WIDTH, height: REF_HEIGHT };

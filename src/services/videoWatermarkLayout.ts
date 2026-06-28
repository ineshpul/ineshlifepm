/** Reference frame for proportional watermark sizing (9:16 portrait). */
const REF_WIDTH = 1080;
const REF_HEIGHT = 1920;

const MAX_PROMPT_LINES = 5;

function scaleByHeight(height: number, px: number): number {
  return (height * px) / REF_HEIGHT;
}

function scaleByWidth(width: number, px: number): number {
  return (width * px) / REF_WIDTH;
}

/** Word-wrap line count for the prompt at export resolution (conservative width estimate). */
export function estimatePromptLines(title: string, availableWidth: number, fontSize: number): number {
  const text = title.trim() || "Today's leap";
  if (!text) return 1;

  const avgCharWidth = fontSize * 0.58;
  const charsPerLine = Math.max(6, Math.floor(availableWidth / avgCharWidth));
  const words = text.split(/\s+/).filter(Boolean);

  let lines = 1;
  let lineLen = 0;
  for (const word of words) {
    if (lineLen === 0) {
      lineLen = word.length;
      continue;
    }
    if (lineLen + 1 + word.length <= charsPerLine) {
      lineLen += 1 + word.length;
    } else {
      lines += 1;
      lineLen = word.length;
    }
  }

  return Math.min(Math.max(lines, 1), MAX_PROMPT_LINES);
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
export function computeVideoWatermarkLayout(
  width: number,
  height: number,
  title?: string
): VideoWatermarkLayout {
  const pillHeight = scaleByHeight(height, 72);
  const paddingHorizontal = scaleByWidth(width, 32);
  const paddingBottom = scaleByHeight(height, 32);
  const fadeHeight = scaleByHeight(height, 48);
  const promptSize = scaleByHeight(height, 48);
  const promptLineHeight = scaleByHeight(height, 52);
  const metaSize = scaleByHeight(height, 32);
  const metaLineHeight = scaleByHeight(height, 36);
  const metaMarginTop = scaleByHeight(height, 6);

  const availableWidth = width - 2 * paddingHorizontal;
  const promptLines = estimatePromptLines(title ?? '', availableWidth, promptSize);
  const bufferedPromptLines = Math.min(promptLines + 1, MAX_PROMPT_LINES + 1);
  const textBlockHeight = bufferedPromptLines * promptLineHeight + metaMarginTop + metaLineHeight;
  const stripHeight = Math.max(
    scaleByHeight(height, 150),
    textBlockHeight + paddingBottom + fadeHeight
  );

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
      height: stripHeight,
      gradientHeight: fadeHeight,
      paddingHorizontal,
      paddingBottom,
      promptSize,
      promptLineHeight,
      metaSize,
      metaLineHeight,
      metaMarginTop,
    },
  };
}

/** Default portrait size when native render dimensions are unavailable. */
export const DEFAULT_WATERMARK_FRAME = { width: REF_WIDTH, height: REF_HEIGHT };

/** BeReal-style selfie PiP (points). */
export const DUAL_PIP_WIDTH = 120;
export const DUAL_PIP_HEIGHT = 160;
export const DUAL_PIP_MARGIN = 16;

export type DualPipRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function defaultDualPipRect(): DualPipRect {
  return {
    x: DUAL_PIP_MARGIN,
    y: DUAL_PIP_MARGIN,
    width: DUAL_PIP_WIDTH,
    height: DUAL_PIP_HEIGHT,
  };
}

export function clampDualPipPosition(
  x: number,
  y: number,
  bounds: { width: number; height: number }
): { x: number; y: number } {
  if (bounds.width < 1 || bounds.height < 1) {
    return { x: DUAL_PIP_MARGIN, y: DUAL_PIP_MARGIN };
  }
  const maxX = Math.max(0, bounds.width - DUAL_PIP_WIDTH);
  const maxY = Math.max(0, bounds.height - DUAL_PIP_HEIGHT);
  return {
    x: Math.round(Math.min(maxX, Math.max(0, x))),
    y: Math.round(Math.min(maxY, Math.max(0, y))),
  };
}

export function clampDualPipRect(
  frame: Pick<DualPipRect, 'x' | 'y'>,
  bounds: { width: number; height: number }
): DualPipRect {
  const { x, y } = clampDualPipPosition(frame.x, frame.y, bounds);
  return { x, y, width: DUAL_PIP_WIDTH, height: DUAL_PIP_HEIGHT };
}

/** Map preview-space PiP to normalized 0–1 coords for native compositor. */
export function pipRectToNormalized(
  pip: DualPipRect,
  layout: { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  if (layout.width < 1 || layout.height < 1) {
    return { x: 0.05, y: 0.05, width: 0.28, height: 0.22 };
  }
  return {
    x: pip.x / layout.width,
    y: pip.y / layout.height,
    width: pip.width / layout.width,
    height: pip.height / layout.height,
  };
}

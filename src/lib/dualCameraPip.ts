export const DUAL_PIP_WIDTH = 108;
export const DUAL_PIP_HEIGHT = 144;

export const DUAL_PIP_DEFAULT = { x: 14, y: 14 } as const;

export type DualPipFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function defaultDualPipFrame(): DualPipFrame {
  return {
    x: DUAL_PIP_DEFAULT.x,
    y: DUAL_PIP_DEFAULT.y,
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
    return { x: DUAL_PIP_DEFAULT.x, y: DUAL_PIP_DEFAULT.y };
  }
  const maxX = Math.max(0, bounds.width - DUAL_PIP_WIDTH);
  const maxY = Math.max(0, bounds.height - DUAL_PIP_HEIGHT);
  return {
    x: Math.round(Math.min(maxX, Math.max(0, x))),
    y: Math.round(Math.min(maxY, Math.max(0, y))),
  };
}

export function clampDualPipFrame(
  frame: Pick<DualPipFrame, 'x' | 'y'>,
  bounds: { width: number; height: number }
): DualPipFrame {
  const { x, y } = clampDualPipPosition(frame.x, frame.y, bounds);
  return { x, y, width: DUAL_PIP_WIDTH, height: DUAL_PIP_HEIGHT };
}

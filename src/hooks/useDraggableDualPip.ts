import * as React from 'react';
import { Gesture } from 'react-native-gesture-handler';

import {
  clampDualPipFrame,
  clampDualPipPosition,
  defaultDualPipFrame,
  type DualPipFrame,
} from '../lib/dualCameraPip';

export function useDraggableDualPip(bounds: { width: number; height: number }) {
  const [pipFrame, setPipFrame] = React.useState<DualPipFrame>(defaultDualPipFrame);
  const pipFrameRef = React.useRef(pipFrame);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    pipFrameRef.current = pipFrame;
  }, [pipFrame]);

  React.useEffect(() => {
    if (bounds.width < 1 || bounds.height < 1) return;
    setPipFrame((prev) => clampDualPipFrame(prev, bounds));
  }, [bounds.width, bounds.height]);

  const resetPip = React.useCallback(() => {
    setPipFrame(defaultDualPipFrame());
  }, []);

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onBegin(() => {
          dragStartRef.current = { x: pipFrameRef.current.x, y: pipFrameRef.current.y };
        })
        .onUpdate((e) => {
          if (bounds.width < 1 || bounds.height < 1) return;
          const { x, y } = clampDualPipPosition(
            dragStartRef.current.x + e.translationX,
            dragStartRef.current.y + e.translationY,
            bounds
          );
          setPipFrame({ x, y, width: pipFrameRef.current.width, height: pipFrameRef.current.height });
        }),
    [bounds.width, bounds.height]
  );

  return { pipFrame, panGesture, resetPip };
}

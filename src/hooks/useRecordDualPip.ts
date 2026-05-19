import * as React from 'react';
import { Gesture } from 'react-native-gesture-handler';

import {
  clampDualPipRect,
  defaultDualPipRect,
  type DualPipRect,
} from '../record/dualPipLayout';

export function useRecordDualPip(bounds: { width: number; height: number }) {
  const [pipRect, setPipRect] = React.useState<DualPipRect>(defaultDualPipRect);
  const pipRef = React.useRef(pipRect);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  React.useEffect(() => {
    pipRef.current = pipRect;
  }, [pipRect]);

  React.useEffect(() => {
    if (bounds.width < 1 || bounds.height < 1) return;
    setPipRect((prev) => clampDualPipRect(prev, bounds));
  }, [bounds.width, bounds.height]);

  const resetPip = React.useCallback(() => {
    setPipRect(defaultDualPipRect());
  }, []);

  const panGesture = React.useMemo(
    () =>
      Gesture.Pan()
        .minDistance(6)
        .onBegin(() => {
          dragStartRef.current = { x: pipRef.current.x, y: pipRef.current.y };
        })
        .onUpdate((e) => {
          if (bounds.width < 1 || bounds.height < 1) return;
          const { x, y } = clampDualPipRect(
            {
              x: dragStartRef.current.x + e.translationX,
              y: dragStartRef.current.y + e.translationY,
            },
            bounds
          );
          setPipRect({
            x,
            y,
            width: pipRef.current.width,
            height: pipRef.current.height,
          });
        }),
    [bounds.width, bounds.height]
  );

  return { pipRect, panGesture, resetPip };
}

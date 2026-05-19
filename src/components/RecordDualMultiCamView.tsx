import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import type { RecordDualCameraModule } from '../lib/recordDualCamera';
import type { DualPipRect } from '../record/dualPipLayout';

type Props = {
  dualModule: RecordDualCameraModule;
  width: number;
  height: number;
  pipRect: DualPipRect;
  panGesture: ReturnType<typeof import('react-native-gesture-handler').Gesture.Pan>;
  onReady?: () => void;
};

/**
 * One AVCaptureMultiCamSession: back fills the preview, front lives in the PiP rect.
 * Do not mount expo-camera CameraView at the same time — two sessions fight and freeze.
 */
export function RecordDualMultiCamView({
  dualModule,
  width,
  height,
  pipRect,
  panGesture,
  onReady,
}: Props) {
  const DualCamera = dualModule.DualCamera;
  const readyRef = React.useRef(false);

  const backFrame = React.useMemo(
    () => ({ x: 0, y: 0, width: Math.round(width), height: Math.round(height) }),
    [width, height]
  );

  const frontFrame = React.useMemo(
    () => ({
      x: Math.round(pipRect.x),
      y: Math.round(pipRect.y),
      width: Math.round(pipRect.width),
      height: Math.round(pipRect.height),
    }),
    [pipRect.x, pipRect.y, pipRect.width, pipRect.height]
  );

  React.useEffect(() => {
    readyRef.current = false;
    if (width < 1 || height < 1) return undefined;
    const t = setTimeout(() => {
      if (readyRef.current) return;
      readyRef.current = true;
      onReady?.();
    }, 400);
    return () => clearTimeout(t);
  }, [width, height, onReady]);

  if (width < 1 || height < 1) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <DualCamera
        style={StyleSheet.absoluteFill}
        backFrame={backFrame}
        frontFrame={frontFrame}
        backGravity="resizeAspectFill"
        frontGravity="resizeAspectFill"
      />
      <GestureDetector gesture={panGesture}>
        <View
          style={[
            styles.pipDragTarget,
            {
              left: pipRect.x,
              top: pipRect.y,
              width: pipRect.width,
              height: pipRect.height,
            },
          ]}
          accessibilityRole="adjustable"
          accessibilityLabel="Move selfie preview"
        />
      </GestureDetector>
      <View
        pointerEvents="none"
        style={[
          styles.pipBorder,
          {
            left: pipRect.x,
            top: pipRect.y,
            width: pipRect.width,
            height: pipRect.height,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pipDragTarget: {
    position: 'absolute',
    zIndex: 13,
  },
  pipBorder: {
    position: 'absolute',
    zIndex: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
});

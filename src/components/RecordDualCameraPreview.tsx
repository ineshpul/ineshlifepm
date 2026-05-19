import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import type { ExpoDualCameraModule } from '../lib/expoDualCamera';
import type { DualPipFrame } from '../lib/dualCameraPip';

type Props = {
  dualModule: ExpoDualCameraModule;
  width: number;
  height: number;
  pipFrame: DualPipFrame;
  onReady?: () => void;
};

/**
 * Simultaneous front + back preview via AVCaptureMultiCamSession (iOS) / CameraX concurrent (Android).
 * Parent must lazy-load the module; this component never imports expo-dual-camera itself.
 */
export function RecordDualCameraPreview({ dualModule, width, height, pipFrame, onReady }: Props) {
  const DualCamera = dualModule.DualCamera;
  const readySentRef = React.useRef(false);

  const backFrame = React.useMemo(
    () => ({ x: 0, y: 0, width: Math.round(width), height: Math.round(height) }),
    [width, height]
  );
  const frontFrame = React.useMemo(
    () => ({
      x: Math.round(pipFrame.x),
      y: Math.round(pipFrame.y),
      width: Math.round(pipFrame.width),
      height: Math.round(pipFrame.height),
    }),
    [pipFrame.x, pipFrame.y, pipFrame.width, pipFrame.height]
  );

  React.useEffect(() => {
    readySentRef.current = false;
    if (width < 1 || height < 1) return;
    const t = setTimeout(() => {
      if (readySentRef.current) return;
      readySentRef.current = true;
      onReady?.();
    }, 450);
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
    </View>
  );
}

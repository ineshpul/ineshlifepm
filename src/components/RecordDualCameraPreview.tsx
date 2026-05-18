import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { getExpoDualCameraModule } from '../lib/expoDualCamera';

/** PiP matches RecordScreen dual overlay styling (top-left). */
const PIP = { left: 14, top: 14, width: 108, height: 144 } as const;

type Props = {
  width: number;
  height: number;
};

/**
 * Simultaneous front + back preview via AVCaptureMultiCamSession (iOS) / CameraX concurrent (Android).
 * Do not mount a second `CameraView` — that breaks the back feed on iOS.
 */
export function RecordDualCameraPreview({ width, height }: Props) {
  const dualMod = getExpoDualCameraModule();
  const DualCamera = dualMod?.DualCamera;

  const backFrame = React.useMemo(
    () => ({ x: 0, y: 0, width: Math.round(width), height: Math.round(height) }),
    [width, height]
  );
  const frontFrame = React.useMemo(
    () => ({
      x: PIP.left,
      y: PIP.top,
      width: PIP.width,
      height: PIP.height,
    }),
    []
  );

  React.useEffect(() => {
    if (!__DEV__ || !DualCamera) return;
    console.log('[Record] DualCamera mounted', { backFrame, frontFrame });
    return () => {
      console.log('[Record] DualCamera unmounted');
    };
  }, [DualCamera, backFrame, frontFrame]);

  if (!DualCamera || width < 1 || height < 1) return null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <DualCamera
        style={StyleSheet.absoluteFill}
        backFrame={backFrame}
        frontFrame={frontFrame}
        backGravity="resizeAspectFill"
        frontGravity="resizeAspectFill"
      />
      <View style={[styles.pipBorder, { left: PIP.left, top: PIP.top, width: PIP.width, height: PIP.height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pipBorder: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'transparent',
  },
});

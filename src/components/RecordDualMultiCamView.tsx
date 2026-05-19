import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import {
  DualCameraBackView,
  DualCameraFrontView,
  useIsDualCameraReady,
} from 'expo-dual-camera';
import { GestureDetector } from 'react-native-gesture-handler';

import type { DualPipRect } from '../record/dualPipLayout';
import { DUAL_PIP_HEIGHT, DUAL_PIP_WIDTH } from '../record/dualPipLayout';

type Props = {
  pipRect: DualPipRect;
  panGesture: ReturnType<typeof import('react-native-gesture-handler').Gesture.Pan>;
  onReady?: () => void;
};

/**
 * Simultaneous front + back via expo-dual-camera 55 (one MultiCam session, two views).
 */
export function RecordDualMultiCamView({ pipRect, panGesture, onReady }: Props) {
  const {
    isReady,
    onFrontCameraReady,
    onBackCameraReady,
    onFrontMountError,
    onBackMountError,
  } = useIsDualCameraReady();

  React.useEffect(() => {
    if (isReady) onReady?.();
  }, [isReady, onReady]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <DualCameraBackView
        style={StyleSheet.absoluteFill}
        onCameraReady={onBackCameraReady}
        onMountError={onBackMountError}
      />
      <GestureDetector gesture={panGesture}>
        <View
          style={[
            styles.pipWrap,
            {
              left: pipRect.x,
              top: pipRect.y,
              width: pipRect.width,
              height: pipRect.height,
            },
          ]}
          accessibilityRole="adjustable"
          accessibilityLabel="Move selfie preview"
        >
          <DualCameraFrontView
            style={styles.pipView}
            mirror
            onCameraReady={onFrontCameraReady}
            onMountError={onFrontMountError}
          />
          <View style={styles.pipBorder} pointerEvents="none" />
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  pipWrap: {
    position: 'absolute',
    zIndex: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  pipView: {
    width: DUAL_PIP_WIDTH,
    height: DUAL_PIP_HEIGHT,
  },
  pipBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
});

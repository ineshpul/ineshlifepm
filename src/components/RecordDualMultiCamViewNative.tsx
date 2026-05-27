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

export type RecordDualMultiCamViewNativeProps = {
  pipRect: DualPipRect;
  panGesture: ReturnType<typeof import('react-native-gesture-handler').Gesture.Pan>;
  pipCamera?: 'front' | 'back';
  onReady?: () => void;
};

export function RecordDualMultiCamViewNative({
  pipRect,
  panGesture,
  pipCamera = 'front',
  onReady,
}: RecordDualMultiCamViewNativeProps) {
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

  const MainCamera = pipCamera === 'front' ? DualCameraBackView : DualCameraFrontView;
  const PipCamera = pipCamera === 'front' ? DualCameraFrontView : DualCameraBackView;
  const pipMirror = pipCamera === 'front';
  const mainMirror = pipCamera === 'back';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <MainCamera
        style={StyleSheet.absoluteFill}
        mirror={mainMirror}
        onCameraReady={pipCamera === 'front' ? onBackCameraReady : onFrontCameraReady}
        onMountError={pipCamera === 'front' ? onBackMountError : onFrontMountError}
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
          <PipCamera
            style={styles.pipView}
            mirror={pipMirror}
            onCameraReady={pipCamera === 'front' ? onFrontCameraReady : onBackCameraReady}
            onMountError={pipCamera === 'front' ? onFrontMountError : onBackMountError}
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

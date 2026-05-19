import * as React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { DualPipFrame } from '../lib/dualCameraPip';

type Props = {
  pipFrame: DualPipFrame;
  panGesture: ReturnType<typeof Gesture.Pan>;
  /** Static placeholder (iOS Expo Go). */
  showPlaceholder?: boolean;
  showExpoGoHint?: boolean;
  /** Live front preview in PiP (Android without native dual). */
  showLiveFrontPreview?: boolean;
};

/**
 * Draggable PiP chrome + optional front preview. Position stays in sync with native DualCamera frontFrame.
 */
export function RecordDraggableDualPip({
  pipFrame,
  panGesture,
  showPlaceholder = false,
  showExpoGoHint = false,
  showLiveFrontPreview = false,
}: Props) {
  const useLiveFront = showLiveFrontPreview && Platform.OS === 'android';

  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.pipWrap,
          {
            left: pipFrame.x,
            top: pipFrame.y,
            width: pipFrame.width,
            height: pipFrame.height,
          },
        ]}
        accessibilityRole="adjustable"
        accessibilityLabel="Move selfie preview"
      >
        {useLiveFront ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="front"
            mirror
            mode="video"
          />
        ) : showPlaceholder ? (
          <View style={styles.pipInner}>
            <Ionicons name="person-circle-outline" size={36} color="rgba(255,255,255,0.85)" />
            {showExpoGoHint ? (
              <Text style={styles.pipHint}>Live selfie in TestFlight</Text>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.pipBorder, StyleSheet.absoluteFill]} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pipWrap: {
    position: 'absolute',
    zIndex: 14,
    borderRadius: 14,
    overflow: 'hidden',
  },
  pipInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 4,
    paddingHorizontal: 6,
  },
  pipHint: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  pipBorder: {
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'transparent',
  },
});

import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';

import type { DualPipRect } from '../record/dualPipLayout';

type Props = {
  pipRect: DualPipRect;
  panGesture: ReturnType<typeof import('react-native-gesture-handler').Gesture.Pan>;
};

/** Expo Go only — no native dual module; back preview is expo-camera underneath. */
export function RecordDualExpoGoPip({ pipRect, panGesture }: Props) {
  return (
    <GestureDetector gesture={panGesture}>
      <View
        style={[
          styles.wrap,
          {
            left: pipRect.x,
            top: pipRect.y,
            width: pipRect.width,
            height: pipRect.height,
          },
        ]}
      >
        <View style={styles.inner}>
          <Text style={styles.text}>Full app only</Text>
          <Text style={styles.subtext}>Dual camera needs a dev or TestFlight build</Text>
        </View>
        <View style={styles.border} pointerEvents="none" />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
  },
  text: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtext: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.65)',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 12,
  },
  border: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
});

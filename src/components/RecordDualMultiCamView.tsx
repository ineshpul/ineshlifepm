import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { canUseDualCameraNativePreview } from '../lib/recordDualCamera';
import type { DualPipRect } from '../record/dualPipLayout';

type Props = {
  pipRect: DualPipRect;
  panGesture: ReturnType<typeof import('react-native-gesture-handler').Gesture.Pan>;
  pipCamera?: 'front' | 'back';
  onReady?: () => void;
};

/**
 * Simultaneous front + back via expo-dual-camera.
 * Does not import expo-dual-camera until native views are confirmed in this binary.
 */
export function RecordDualMultiCamView(props: Props) {
  if (!canUseDualCameraNativePreview()) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.fallback]}>
        <Text style={styles.fallbackText}>
          Dual camera needs a dev build that includes expo-dual-camera (not Expo Go).
        </Text>
      </View>
    );
  }

  const Native = React.useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./RecordDualMultiCamViewNative')
        .RecordDualMultiCamViewNative as React.ComponentType<Props>;
    } catch {
      return null;
    }
  }, []);

  if (!Native) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.fallback]}>
        <Text style={styles.fallbackText}>Dual camera module could not load.</Text>
      </View>
    );
  }

  return <Native {...props} />;
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
  },
  fallbackText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 18,
  },
});

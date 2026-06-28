import * as React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemedStyles } from '../theme/ThemeProvider';
import { useBackgroundPostUpload } from '../state/backgroundPostUpload';

export function BackgroundUploadBar() {
  const insets = useSafeAreaInsets();
  const { phase, progress, errorMessage, retryBackgroundPost, dismissFailure } =
    useBackgroundPostUpload();

  const styles = useThemedStyles((colors) => ({
    wrap: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      paddingTop: insets.top + 4,
      paddingHorizontal: 12,
      pointerEvents: 'box-none' as const,
    },
    bar: {
      borderRadius: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden' as const,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    track: {
      height: 3,
      backgroundColor: colors.cardTint,
    },
    fill: {
      height: 3,
      backgroundColor: colors.green,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      paddingVertical: 8,
      paddingHorizontal: 12,
      gap: 10,
    },
    label: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
    },
    retryBtn: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: colors.green,
    },
    retryTxt: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.white,
      letterSpacing: 0.3,
    },
    dismissBtn: {
      padding: 4,
    },
    dismissTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.muted,
    },
    failedTrack: {
      height: 3,
      backgroundColor: colors.coral,
    },
  }));

  if (phase === 'idle') return null;

  const isFailed = phase === 'failed';
  const label = isFailed
    ? errorMessage ?? 'Upload failed — your attempt was restored.'
    : phase === 'saving'
      ? 'Saving your leap…'
      : progress > 0
        ? `Uploading your leap… ${progress}%`
        : 'Uploading your leap…';

  const fillWidthPct = isFailed ? 100 : Math.max(4, Math.min(100, progress));

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <View style={isFailed ? styles.failedTrack : styles.track}>
          {!isFailed ? <View style={[styles.fill, { width: `${fillWidthPct}%` as `${number}%` }]} /> : null}
        </View>
        <View style={styles.row}>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
          {isFailed ? (
            <>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={retryBackgroundPost}
                accessibilityRole="button"
                accessibilityLabel="Retry upload"
              >
                <Text style={styles.retryTxt}>RETRY</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dismissBtn}
                onPress={dismissFailure}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
              >
                <Text style={styles.dismissTxt}>Dismiss</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

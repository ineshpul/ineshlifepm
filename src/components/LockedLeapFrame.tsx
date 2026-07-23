import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { FeedLockedCardOverlay } from './FeedLockedCardOverlay';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  /** JPEG/PNG only. Never pass a video URL. */
  posterUrl?: string | null;
  unlocking?: boolean;
};

/**
 * Locked leap media: static image (or tint) + frost.
 * Intentionally imports neither expo-av nor expo-video — locked tiles must not
 * own a decoder at all (pause/mute races were letting clips play under frost).
 */
export function LockedLeapFrame({ posterUrl, unlocking = false }: Props) {
  const { colors } = useTheme();
  const uri = String(posterUrl ?? '').trim();

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="box-none" collapsable={false}>
      {uri ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
          pointerEvents="none"
        />
      ) : (
        <View
          style={[StyleSheet.absoluteFillObject, { backgroundColor: colors.cardTint }]}
          pointerEvents="none"
        />
      )}
      <FeedLockedCardOverlay unlocking={unlocking} />
    </View>
  );
}

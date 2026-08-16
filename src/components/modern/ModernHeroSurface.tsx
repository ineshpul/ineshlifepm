import * as React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeProvider';

/** Bottom corner radius of the Today hero (mockup 01). */
export const MODERN_HERO_RADIUS = 40;

type Props = {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Ivory → soft-green hero canvas with two light blooms, rounded only at the bottom so it
 * bleeds under the status bar like the modernization mockups.
 */
export function ModernHeroSurface({ children, style }: Props) {
  const { isDark } = useTheme();
  const fill = isDark
    ? {
        top: '#18241F',
        mid: '#141F1A',
        bottom: '#111A16',
        glow: 'rgba(143, 227, 168, 0.12)',
        wash: 'rgba(143, 227, 168, 0.07)',
      }
    : {
        top: '#EAF5EC',
        mid: '#DCEFDF',
        bottom: '#D3EAD8',
        glow: 'rgba(255, 255, 255, 0.78)',
        wash: 'rgba(28, 124, 67, 0.10)',
      };

  return (
    <View style={[styles.root, { backgroundColor: fill.mid }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="modernHeroFill" x1="0" y1="0" x2="0.6" y2="1">
              <Stop offset="0" stopColor={fill.top} />
              <Stop offset="0.55" stopColor={fill.mid} />
              <Stop offset="1" stopColor={fill.bottom} />
            </LinearGradient>
            <RadialGradient id="modernHeroGlow" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={fill.glow} />
              <Stop offset="0.68" stopColor={fill.glow} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="modernHeroWash" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={fill.wash} />
              <Stop offset="0.7" stopColor={fill.wash} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#modernHeroFill)" />
          <Circle cx="90%" cy="0%" r="150" fill="url(#modernHeroGlow)" />
          <Circle cx="2%" cy="100%" r="145" fill="url(#modernHeroWash)" />
        </Svg>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomLeftRadius: MODERN_HERO_RADIUS,
    borderBottomRightRadius: MODERN_HERO_RADIUS,
    overflow: 'hidden',
  },
});

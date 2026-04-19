import * as React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

export function Brandmark({
  size = 56,
  style,
  blendOnDark,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
  /** Helps hide a white matte in the PNG on dark UIs (e.g. Record). */
  blendOnDark?: boolean;
}) {
  const imgStyle = {
    width: size,
    height: size,
    backgroundColor: 'transparent' as const,
    ...(blendOnDark && Platform.OS !== 'web' ? { blendMode: 'darken' as const } : {}),
  };

  return (
    <View style={[{ backgroundColor: 'transparent' }, style]}>
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel="Leap logo"
        source={require('../../assets/brandmark.png')}
        style={imgStyle}
        contentFit="contain"
        transition={0}
      />
    </View>
  );
}

/** Same component; common alternate spelling for imports/JSX. */
export const BrandMark = Brandmark;

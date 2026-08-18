import * as React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Props = {
  edge: 'top' | 'bottom';
  height: number;
  /** Opacity at the screen edge; fades to fully transparent toward the middle. */
  strength: number;
};

/**
 * Reel legibility scrim. Flat `rgba()` overlays ended in a visible horizontal seam where the
 * rectangle stopped, which read as a grey bar across the video — this fades out instead.
 */
export function FeedReelScrim({ edge, height, strength }: Props) {
  const gradientId = `feedReelScrim${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fromTop = edge === 'top';

  return (
    <View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: 0, right: 0, height },
        fromTop ? { top: 0 } : { bottom: 0 },
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradientId} x1={0} y1={fromTop ? 0 : 1} x2={0} y2={fromTop ? 1 : 0}>
            <Stop offset={0} stopColor="#050A07" stopOpacity={strength} />
            <Stop offset={0.45} stopColor="#050A07" stopOpacity={strength * 0.42} />
            <Stop offset={0.78} stopColor="#050A07" stopOpacity={strength * 0.12} />
            <Stop offset={1} stopColor="#050A07" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}

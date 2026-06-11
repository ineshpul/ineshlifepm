import * as React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { colors } from '../theme/colors';
import {
  computeVideoWatermarkLayout,
  type VideoWatermarkLayout,
} from '../services/videoWatermarkLayout';

export const WATERMARK_HEADING_SEMIBOLD = 'Outfit_600SemiBold';
export const WATERMARK_HEADING_BOLD = 'Outfit_700Bold';

export type VideoWatermarkOverlayProps = {
  title: string;
  username: string;
  width: number;
  height: number;
};

/** Full-frame transparent PNG layer burned onto exported videos (not shown in-app). */
export function VideoWatermarkOverlay({
  title,
  username,
  width,
  height,
}: VideoWatermarkOverlayProps) {
  const layout = React.useMemo(() => computeVideoWatermarkLayout(width, height), [width, height]);
  const displayTitle = title.trim() || "Today's leap";
  const handle = username.trim() || 'user';
  const gradientStop = Math.min(1, layout.strip.gradientHeight / layout.strip.height);

  return (
    <View style={[styles.frame, { width, height }]}>
      <CornerPill layout={layout} />
      <View style={[styles.strip, { height: layout.strip.height }]}>
        <Svg width={width} height={layout.strip.height} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="stripFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.black} stopOpacity={0} />
              <Stop offset={gradientStop} stopColor={colors.black} stopOpacity={0.55} />
              <Stop offset="1" stopColor={colors.black} stopOpacity={0.55} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={width} height={layout.strip.height} fill="url(#stripFade)" />
        </Svg>
        <View
          style={[
            styles.stripContent,
            {
              paddingHorizontal: layout.strip.paddingHorizontal,
              paddingBottom: layout.strip.paddingBottom,
            },
          ]}
        >
          <Text
            style={[
              styles.prompt,
              {
                fontFamily: WATERMARK_HEADING_SEMIBOLD,
                fontSize: layout.strip.promptSize,
                lineHeight: layout.strip.promptLineHeight,
              },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayTitle}
          </Text>
          <Text
            style={[
              styles.meta,
              {
                fontFamily: WATERMARK_HEADING_SEMIBOLD,
                fontSize: layout.strip.metaSize,
                lineHeight: layout.strip.metaLineHeight,
                marginTop: layout.strip.metaMarginTop,
              },
            ]}
            numberOfLines={1}
          >
            @{handle} · taketheleap.app
          </Text>
        </View>
      </View>
    </View>
  );
}

function CornerPill({ layout }: { layout: VideoWatermarkLayout }) {
  const { pill } = layout;
  return (
    <View
      style={[
        styles.pillWrap,
        {
          top: pill.insetTop,
          right: pill.insetRight,
          height: pill.height,
          borderRadius: pill.borderRadius,
          paddingHorizontal: pill.paddingHorizontal,
          gap: pill.gap,
        },
      ]}
    >
      <Image
        accessibilityIgnoresInvertColors
        source={require('../../assets/leap-logo-white.png')}
        style={{
          width: pill.logoHeight,
          height: pill.logoHeight,
          backgroundColor: 'transparent',
        }}
        resizeMode="contain"
      />
      <Text
        style={{
          fontFamily: WATERMARK_HEADING_BOLD,
          fontSize: pill.wordmarkSize,
          lineHeight: pill.wordmarkSize * 1.05,
          color: colors.white,
        }}
      >
        Leap
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: 'transparent',
    position: 'relative',
  },
  pillWrap: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  stripContent: {
    width: '100%',
  },
  prompt: {
    color: colors.white,
    fontWeight: '600',
  },
  meta: {
    color: colors.watermarkMeta,
    fontWeight: '600',
  },
});

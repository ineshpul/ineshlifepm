import * as React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import {
  computeVideoWatermarkLayout,
  type VideoWatermarkLayout,
} from '../services/videoWatermarkLayout';

export const WATERMARK_HEADING_SEMIBOLD = 'Outfit_600SemiBold';
export const WATERMARK_HEADING_BOLD = 'Outfit_700Bold';

export type VideoWatermarkVariant = 'leap' | 'bestPart';

export type VideoWatermarkOverlayProps = {
  /** Leap: challenge prompt. Best Part: formatted date (e.g. "Jul 25"). */
  title: string;
  username: string;
  width: number;
  height: number;
  /**
   * `leap` — logo + prompt + @user · site (daily challenge export).
   * `bestPart` — logo + title (date or “Your week w/ Leap”) + @user · site.
   */
  variant?: VideoWatermarkVariant;
  /** Fired once the Leap logo has loaded (or failed) so callers can time the capture. */
  onLogoSettled?: () => void;
};

/** Full-frame transparent PNG layer burned onto exported videos (not shown in-app). */
export function VideoWatermarkOverlay({
  title,
  username,
  width,
  height,
  variant = 'leap',
  onLogoSettled,
}: VideoWatermarkOverlayProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    frame: {
      backgroundColor: 'transparent',
      position: 'relative' as const,
    },
    strip: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'flex-end' as const,
    },
    stripContent: {
      width: '100%' as const,
    },
    prompt: {
      color: colors.white,
      fontWeight: '600' as const,
    },
    meta: {
      color: colors.watermarkMeta,
      fontWeight: '600' as const,
    },
  }));

  const isBestPart = variant === 'bestPart';
  const displayTitle = title.trim() || (isBestPart ? 'Today' : "Today's leap");
  const layout = React.useMemo(
    () => computeVideoWatermarkLayout(width, height, displayTitle),
    [width, height, displayTitle]
  );
  const handle = username.trim() || 'user';
  const gradientStop = Math.min(1, layout.strip.gradientHeight / layout.strip.height);

  return (
    <View style={[styles.frame, { width, height }]}>
      <CornerPill layout={layout} colors={colors} onLogoSettled={onLogoSettled} />
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

function CornerPill({
  layout,
  colors,
  onLogoSettled,
}: {
  layout: VideoWatermarkLayout;
  colors: ReturnType<typeof useTheme>['colors'];
  onLogoSettled?: () => void;
}) {
  const { pill } = layout;
  return (
    <View
      style={[
        {
          position: 'absolute',
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.overlay,
        },
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
        accessibilityLabel="Leap logo"
        source={require('../../assets/brandmark.png')}
        style={{
          width: pill.logoHeight,
          height: pill.logoHeight,
          backgroundColor: 'transparent',
          ...(Platform.OS !== 'web' ? { blendMode: 'darken' as const } : {}),
        }}
        contentFit="contain"
        transition={0}
        cachePolicy="memory-disk"
        onLoad={onLogoSettled}
        onError={onLogoSettled}
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

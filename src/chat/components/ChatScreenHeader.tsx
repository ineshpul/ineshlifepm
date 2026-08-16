import * as React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';
import { ChatHeaderBack } from './ChatHeaderBack';

type Props = {
  title: string;
  onBack: () => void;
  backAccessibilityLabel?: string;
  /** Optional trailing control (already sized ~40). */
  right?: React.ReactNode;
  /** Center title; default true. When false, title sits left of trailing space. */
  centerTitle?: boolean;
  /** Optional subtitle under title (e.g. member count). */
  subtitle?: string;
  /** Replace the default title text (e.g. DM peer row). */
  titleNode?: React.ReactNode;
};

/**
 * Fully custom chat header — avoids iOS 26 UIBarButtonItem glass circles
 * that wrap native-stack headerLeft/headerRight.
 */
export function ChatScreenHeader({
  title,
  onBack,
  backAccessibilityLabel,
  right,
  centerTitle = true,
  subtitle,
  titleNode,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    wrap: {
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border2,
      paddingTop: insets.top,
    },
    row: {
      minHeight: 48,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 4,
      paddingBottom: 4,
    },
    side: {
      width: 48,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center' as const,
      alignItems: (centerTitle ? 'center' : 'flex-start') as 'center' | 'flex-start',
      paddingHorizontal: 4,
    },
    title: {
      fontSize: 17,
      fontFamily: typography.displayBold,
      color: c.text,
      textAlign: (centerTitle ? 'center' : 'left') as 'center' | 'left',
    },
    subtitle: {
      marginTop: 1,
      fontSize: 12,
      fontFamily: typography.bodySemiBold,
      color: c.muted,
      textAlign: (centerTitle ? 'center' : 'left') as 'center' | 'left',
    },
  }));

  return (
    <View style={styles.wrap} accessibilityRole="header">
      <View style={styles.row}>
        <View style={styles.side}>
          <ChatHeaderBack
            onPress={onBack}
            accessibilityLabel={backAccessibilityLabel ?? 'Back'}
          />
        </View>
        <View style={styles.titleWrap}>
          {titleNode ?? (
            <>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </>
          )}
        </View>
        <View style={styles.side}>{right ?? null}</View>
      </View>
      {/* Keep Android status-bar contrast consistent */}
      {Platform.OS === 'android' ? <View style={{ height: 0, backgroundColor: colors.bg }} /> : null}
    </View>
  );
}

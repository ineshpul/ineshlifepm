import * as React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';

type Props = {
  title: string;
  subtitle?: string;
  /** Icon / glyph rendered inside the 44pt leading tile. */
  leading: React.ReactNode;
  leadingStyle?: StyleProp<ViewStyle>;
  chevronColor?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** White card row with a tinted leading tile and chevron (mockups 01 and 06). */
export function ModernActionRow({
  title,
  subtitle,
  leading,
  leadingStyle,
  chevronColor,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  style,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 13,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
      borderRadius: 20,
      paddingVertical: 13,
      paddingHorizontal: 15,
    },
    pressed: {
      opacity: 0.86,
    },
    tile: {
      width: 44,
      height: 44,
      borderRadius: 15,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      flexShrink: 0,
    },
    body: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      fontFamily: typography.bodyBold,
      fontSize: 15,
      color: c.text,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: typography.bodySemiBold,
      fontSize: 12,
      color: c.muted2,
    },
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, style]}
    >
      <View style={[styles.tile, leadingStyle]}>{leading}</View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={chevronColor ?? colors.muted2} />
    </Pressable>
  );
}

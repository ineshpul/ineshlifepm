import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';

type Props = {
  title: string;
  subtitle: string;
  onPress: () => void;
};

/** Gold callout that hands off to the existing Leaperboard route (mockup 01). */
export function ModernLeaderboardCallout({ title, subtitle, onPress }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    card: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      backgroundColor: c.highlightCardBg,
      borderWidth: 1.5,
      borderColor: c.highlightCardBorder,
      borderRadius: 20,
      paddingVertical: 12,
      paddingHorizontal: 14,
      ...Platform.select({
        ios: {
          shadowColor: '#A0780A',
          shadowOpacity: 0.16,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
    pressed: {
      opacity: 0.9,
    },
    tile: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: c.podiumAccent,
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
      fontSize: 14.5,
      color: c.text,
    },
    subtitle: {
      marginTop: 2,
      fontFamily: typography.bodySemiBold,
      fontSize: 12,
      color: c.highlightCardBadge,
    },
  }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.tile}>
        <Ionicons name="trophy" size={19} color={colors.white} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color={colors.podiumAccent} />
    </Pressable>
  );
}

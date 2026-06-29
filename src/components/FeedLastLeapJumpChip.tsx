import * as React from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

type Props = {
  onPress: () => void;
  bottom: number;
};

/** TikTok-style chip — jumps to the last allowed leap day in the feed. */
export function FeedLastLeapJumpChip({ onPress, bottom }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    chip: {
      position: 'absolute',
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(17, 24, 39, 0.88)',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: c.white,
    },
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Jump to your last allowed leap"
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { bottom }, pressed && { opacity: 0.88 }]}
    >
      <Text style={styles.label}>Last leap</Text>
      <Ionicons name="chevron-down" size={16} color={colors.coral} />
    </Pressable>
  );
}

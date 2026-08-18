import * as React from 'react';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

type Props = {
  onPress: () => void;
  bottom: number;
};

/** TikTok-style chip — jumps to the last allowed leap day in the feed. */
export function FeedLastLeapJumpChip({ onPress, bottom }: Props) {
  const styles = useThemedStyles(() => ({
    chip: {
      position: 'absolute',
      right: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: 'rgba(10, 17, 12, 0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
    },
    label: {
      fontSize: 13,
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
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
      <Ionicons name="chevron-down" size={16} color="rgba(255,255,255,0.72)" />
    </Pressable>
  );
}

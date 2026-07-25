import * as React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

type Props = {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  size?: number;
  color?: string;
};

/** Flat header icon — transparent hit target, no chip / shadow / glow. */
export function ChatHeaderIconButton({ name, onPress, accessibilityLabel, size = 22, color }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(() => ({
    pressable: {
      width: 40,
      height: 40,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'transparent',
    },
    pressed: { opacity: 0.55 },
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <Ionicons name={name} size={size} color={color ?? colors.text} />
    </Pressable>
  );
}

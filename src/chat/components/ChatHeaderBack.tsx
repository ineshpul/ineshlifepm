import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';

type Props = {
  onPress: () => void;
  label?: string;
  accessibilityLabel?: string;
};

/** Flat back control — no card chip, border, or native header glow. */
export function ChatHeaderBack({ onPress, label, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    pressable: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: label ? 4 : 8,
      marginLeft: Platform.OS === 'ios' ? -4 : 0,
      backgroundColor: 'transparent',
    },
    pressed: { opacity: 0.55 },
    label: {
      fontSize: 17,
      fontWeight: '600' as const,
      color: c.text,
      marginLeft: 2,
    },
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (label ? `Back to ${label}` : 'Back')}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <View>
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

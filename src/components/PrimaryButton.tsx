import * as React from 'react';
import { Pressable, Text, ViewStyle } from 'react-native';

import { useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

type Props = {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: 'black' | 'green' | 'outline';
  style?: ViewStyle;
};

export function PrimaryButton({
  title,
  onPress,
  disabled,
  variant = 'black',
  style,
}: Props) {
  const styles = useThemedStyles((colors) => ({
    base: {
      height: 56,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    black: {
      backgroundColor: colors.black,
    },
    green: {
      backgroundColor: colors.green,
    },
    outline: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: {
      opacity: 0.9,
      transform: [{ scale: 0.99 }],
    },
    disabled: {
      opacity: 0.5,
    },
    title: {
      fontFamily: typography.bodyBold,
      fontSize: 15,
      letterSpacing: 0.1,
    },
    titleSolid: {
      color: colors.white,
    },
    titleOutline: {
      color: colors.text,
    },
  }));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'black' && styles.black,
        variant === 'green' && styles.green,
        variant === 'outline' && styles.outline,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.title,
          variant === 'outline' ? styles.titleOutline : styles.titleSolid,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

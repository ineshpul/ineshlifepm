import * as React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors } from '../theme/colors';

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

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: 14,
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
    backgroundColor: colors.white,
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
    fontSize: 14,
    letterSpacing: 0.8,
    fontWeight: '800',
  },
  titleSolid: {
    color: colors.white,
  },
  titleOutline: {
    color: colors.text,
  },
});


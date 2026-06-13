import * as React from 'react';
import { Text, TextInput, TextInputProps, View } from 'react-native';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

type Props = {
  label: string;
  inputProps?: TextInputProps;
};

export function TextField({ label, inputProps }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    wrap: {
      gap: 8,
    },
    label: {
      fontSize: 12,
      letterSpacing: 1.4,
      fontWeight: '800',
      color: c.muted2,
    },
    input: {
      height: 54,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 16,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.inputBg,
    },
  }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        {...inputProps}
        style={[styles.input, inputProps?.style]}
      />
    </View>
  );
}

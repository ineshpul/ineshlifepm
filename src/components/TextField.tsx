import * as React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors } from '../theme/colors';

type Props = {
  label: string;
  inputProps?: TextInputProps;
};

export function TextField({ label, inputProps }: Props) {
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

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    letterSpacing: 1.4,
    fontWeight: '800',
    color: colors.muted2,
  },
  input: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#FAFBFC',
  },
});


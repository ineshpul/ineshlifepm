import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, ViewProps } from 'react-native';

import { colors } from '../theme/colors';

type Props = ViewProps & {
  contentContainerStyle?: any;
};

export function KeyboardScreen({ style, contentContainerStyle, children, ...rest }: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.base, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      {...rest}
    >
      {/*
        Do not wrap ScrollView in TouchableWithoutFeedback — it often steals taps from buttons
        (Continue) on Android, especially with the New Architecture.
      */}
      <ScrollView
        contentContainerStyle={[styles.content, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
  },
});


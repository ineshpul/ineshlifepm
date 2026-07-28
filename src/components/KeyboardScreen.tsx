import * as React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, ViewProps } from 'react-native';

import { useThemedStyles } from '../theme/ThemeProvider';

type Props = ViewProps & {
  contentContainerStyle?: any;
  /** Spread onto KeyboardAvoidingView after the default, so callers can override it. */
  keyboardVerticalOffset?: number;
};

export function KeyboardScreen({ style, contentContainerStyle, children, ...rest }: Props) {
  const styles = useThemedStyles((colors) => ({
    base: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    content: {
      flexGrow: 1,
    },
  }));

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

import * as React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

type Props = ViewProps & {
  withSafeArea?: boolean;
  /** When using `KeyboardAvoidingView`, omit bottom so the composer can sit flush with the keyboard. */
  edges?: readonly Edge[];
};

export function Screen({ withSafeArea = true, edges, style, ...rest }: Props) {
  if (withSafeArea) {
    return <SafeAreaView style={[styles.base, style]} edges={edges} {...rest} />;
  }
  return <View style={[styles.base, style]} {...rest} />;
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});


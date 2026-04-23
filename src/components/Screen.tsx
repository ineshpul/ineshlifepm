import * as React from 'react';
import { Keyboard, Pressable, StyleSheet, View, ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '../theme/colors';

type Props = ViewProps & {
  withSafeArea?: boolean;
  /** When using `KeyboardAvoidingView`, omit bottom so the composer can sit flush with the keyboard. */
  edges?: readonly Edge[];
  /** Tap outside inputs dismisses the soft keyboard (inner content still receives touches first). */
  dismissKeyboardOnTap?: boolean;
};

export function Screen({ withSafeArea = true, edges, style, dismissKeyboardOnTap, ...rest }: Props) {
  if (dismissKeyboardOnTap) {
    const inner = <View style={[styles.flex1, style]} {...rest} />;
    if (withSafeArea) {
      return (
        <SafeAreaView style={styles.base} edges={edges}>
          <Pressable style={styles.flex1} onPress={Keyboard.dismiss} accessible={false}>
            {inner}
          </Pressable>
        </SafeAreaView>
      );
    }
    return (
      <View style={styles.base}>
        <Pressable style={styles.flex1} onPress={Keyboard.dismiss} accessible={false}>
          {inner}
        </Pressable>
      </View>
    );
  }

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
  flex1: { flex: 1 },
});


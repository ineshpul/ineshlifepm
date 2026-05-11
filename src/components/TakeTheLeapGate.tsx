import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Screen } from './Screen';
import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { navigateToRecord } from '../navigation/navigationHelpers';

export type TakeTheLeapGateVariant = 'feed' | 'social';

export function TakeTheLeapGate({
  variant: _variant = 'social',
  embedded = false,
}: {
  variant?: TakeTheLeapGateVariant;
  /** Render inside a profile card / scroll view instead of full-screen */
  embedded?: boolean;
}) {
  const nav = useNavigation<any>();

  const inner = (
    <>
      <View style={[styles.lockIcon, embedded && styles.lockIconEmbedded]}>
        <Text style={[styles.lockEmoji, embedded && styles.lockEmojiEmbedded]}>🔒</Text>
      </View>
      <Text style={[styles.gateTitle, embedded && styles.gateTitleEmbedded]}>Take the leap to continue</Text>
      <PrimaryButton
        title="Leap"
        variant="green"
        onPress={() => navigateToRecord(nav)}
        style={embedded ? styles.gateCtaEmbedded : styles.gateCta}
      />
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedWrap}>{inner}</View>;
  }

  return <Screen style={styles.gateScreen}>{inner}</Screen>;
}

const styles = StyleSheet.create({
  gateScreen: {
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  lockIcon: {
    width: 72,
    height: 72,
    borderRadius: 18,
    backgroundColor: colors.cardTint,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6F4D7',
    marginBottom: 8,
  },
  lockEmoji: {
    fontSize: 26,
  },
  gateTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  gateCta: {
    width: 220,
    borderRadius: 30,
    marginTop: 8,
  },
  embeddedWrap: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    backgroundColor: colors.white,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  lockIconEmbedded: {
    width: 52,
    height: 52,
    marginBottom: 0,
  },
  lockEmojiEmbedded: { fontSize: 22 },
  gateTitleEmbedded: { fontSize: 18, marginTop: 4 },
  gateCtaEmbedded: {
    width: '100%',
    maxWidth: 260,
    borderRadius: 30,
    marginTop: 4,
  },
});

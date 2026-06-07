import * as React from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { PrimaryButton } from './PrimaryButton';
import { colors } from '../theme/colors';
import { buildReferralShareMessage } from '../constants/referral';
import { showInfo } from '../utils/ui';

type Props = {
  username: string;
};

export function ReferralInviteCard({ username }: Props) {
  const handle = username.trim().replace(/^@+/u, '') || 'you';

  const onCopy = async () => {
    await Clipboard.setStringAsync(handle);
    showInfo('Copied', `Your invite username is ${handle}.`);
  };

  const onShare = async () => {
    try {
      await Share.share({ message: buildReferralShareMessage(handle) });
    } catch {
      // dismissed
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Invite friends</Text>
      <Text style={styles.sub}>
        Share your username. When they complete their first leap, you earn 5″.
      </Text>
      <View style={styles.codeRow}>
        <Text style={styles.code}>{handle}</Text>
        <TouchableOpacity onPress={() => void onCopy()} style={styles.copyBtn} activeOpacity={0.7}>
          <Ionicons name="copy-outline" size={18} color={colors.moss} />
          <Text style={styles.copyText}>Copy</Text>
        </TouchableOpacity>
      </View>
      <PrimaryButton title="Share invite" variant="green" onPress={() => void onShare()} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 12,
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  sub: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 18,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  code: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.3,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  copyText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.moss,
  },
});

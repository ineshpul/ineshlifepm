import * as React from 'react';
import {
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from './PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

type Props = {
  visible: boolean;
  onInvite: () => void;
  onDismiss: () => void;
};

export function ReferralIntroModal({ visible, onInvite, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 22,
      paddingTop: 10,
      borderWidth: 1,
      borderBottomWidth: 0,
      borderColor: colors.border,
      gap: 10,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 999,
      backgroundColor: colors.border2,
      marginBottom: 4,
    },
    iconWrap: {
      alignSelf: 'center',
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.cardTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.text,
      textAlign: 'center',
    },
    sub: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.muted,
      lineHeight: 20,
      textAlign: 'center',
      paddingHorizontal: 4,
    },
    actions: {
      gap: 8,
      marginTop: 6,
    },
    laterBtn: {
      alignItems: 'center',
      paddingVertical: 10,
    },
    laterText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.muted,
    },
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <View style={styles.iconWrap}>
            <Ionicons name="people-outline" size={26} color={colors.moss} />
          </View>
          <Text style={styles.title}>Leap together</Text>
          <Text style={styles.sub}>
            Invite friends with your username. Earn 5″ when they complete their first leap — and 10% for
            seven leap days when you both post.
          </Text>
          <View style={styles.actions}>
            <PrimaryButton title="Invite friends" variant="green" onPress={onInvite} />
            <TouchableOpacity onPress={onDismiss} style={styles.laterBtn} activeOpacity={0.7}>
              <Text style={styles.laterText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

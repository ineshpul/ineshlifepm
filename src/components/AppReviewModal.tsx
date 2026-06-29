import * as React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
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
  onReview: () => void;
  onDismiss: () => void;
};

export function AppReviewModal({ visible, onReview, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    root: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay,
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
    starsRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
    },
    starBtn: {
      padding: 4,
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
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onDismiss}
          accessibilityLabel="Dismiss review prompt"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Enjoying Leap?</Text>
          <Text style={styles.sub}>
            Tap a star to leave a quick App Store review — it helps more people discover the daily
            leap and keeps the community growing.
          </Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={onReview}
                style={styles.starBtn}
                accessibilityRole="button"
                accessibilityLabel={`Rate ${star} stars`}
                hitSlop={6}
              >
                <Ionicons name="star" size={34} color={colors.moss} />
              </Pressable>
            ))}
          </View>
          <View style={styles.actions}>
            <PrimaryButton title="Leave a review" variant="green" onPress={onReview} />
            <TouchableOpacity onPress={onDismiss} style={styles.laterBtn} activeOpacity={0.7}>
              <Text style={styles.laterText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

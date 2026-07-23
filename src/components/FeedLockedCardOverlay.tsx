import * as React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { PrimaryButton } from './PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = {
  /** When true, plays a short dissolve-out (e.g. after posting today). */
  unlocking?: boolean;
};

/**
 * Tier 2 frosted lock — no native blur; matches TakeTheLeapGate / referralNudge styling.
 * Parent row should set `collapsable={false}` and FlatList should disable `removeClippedSubviews`
 * on Android while locks are active so this overlay is not clipped.
 */
export function FeedLockedCardOverlay({ unlocking = false }: Props) {
  const nav = useNavigation<any>();
  const { colors } = useTheme();
  const opacity = React.useRef(new Animated.Value(1)).current;

  const styles = useThemedStyles((c) => ({
    root: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 12,
    },
    frost: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.cardTint,
      opacity: 0.72,
    },
    lockIcon: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: c.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
    },
    title: {
      fontSize: 18,
      fontWeight: '900',
      color: c.text,
      textAlign: 'center',
      lineHeight: 24,
    },
    cta: {
      width: 220,
      borderRadius: 30,
      marginTop: 4,
    },
  }));

  React.useEffect(() => {
    if (!unlocking) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 0,
      duration: 520,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [unlocking, opacity]);

  if (unlocking) {
    return (
      <Animated.View style={[styles.root, { opacity }]} pointerEvents="none">
        <View style={styles.frost} pointerEvents="none" />
      </Animated.View>
    );
  }

  return (
    // box-none: let vertical reel swipes reach FlatList; only the Leap CTA captures taps.
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.frost} pointerEvents="none" />
      <View style={styles.lockIcon} pointerEvents="none">
        <Ionicons name="lock-closed-outline" size={28} color={colors.green} />
      </View>
      <Text style={styles.title} pointerEvents="none">
        Post today&apos;s leap to unlock newer leaps
      </Text>
      <PrimaryButton
        title="Leap"
        variant="green"
        onPress={() => navigateToRecord(nav)}
        style={styles.cta}
      />
    </View>
  );
}

import * as React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

type Props = {
  teaserLimit: number;
};

/** Tier 1 — explains preview scroll before the teaser wall. */
export function FeedTier1ExploreBanner({ teaserLimit }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    bar: {
      marginHorizontal: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: c.muted,
      lineHeight: 18,
    },
  }));

  return (
    <View style={styles.bar} pointerEvents="none">
      <View style={styles.icon}>
        <Ionicons name="eye-outline" size={18} color={colors.green} />
      </View>
      <Text style={styles.text}>
        Preview up to {teaserLimit} leaps — post your first leap to unlock the full feed.
      </Text>
    </View>
  );
}

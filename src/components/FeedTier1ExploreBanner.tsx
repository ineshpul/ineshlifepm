import * as React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';

type Props = {
  teaserLimit: number;
};

/** Tier 1 — explains preview scroll before the teaser wall. Dark glass to match reel chrome. */
export function FeedTier1ExploreBanner({ teaserLimit }: Props) {
  const styles = useThemedStyles(() => ({
    bar: {
      marginHorizontal: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 18,
      backgroundColor: 'rgba(10, 17, 12, 0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: 'rgba(255,255,255,0.10)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontFamily: typography.bodySemiBold,
      color: 'rgba(255,255,255,0.82)',
      lineHeight: 18,
    },
  }));

  return (
    <View style={styles.bar} pointerEvents="none">
      <View style={styles.icon}>
        <Ionicons name="eye-outline" size={18} color="#8FE3A8" />
      </View>
      <Text style={styles.text}>
        Preview up to {teaserLimit} leaps — post your first leap to unlock the full feed.
      </Text>
    </View>
  );
}

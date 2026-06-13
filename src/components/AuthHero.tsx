import * as React from 'react';
import { Text, View } from 'react-native';

import { Brandmark } from './Brandmark';
import { useThemedStyles } from '../theme/ThemeProvider';

/** Logo + tagline for sign-in / sign-up. */
export function AuthHero() {
  const styles = useThemedStyles((colors) => ({
    hero: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 18,
      paddingHorizontal: 12,
    },
    logoWrap: {
      width: 88,
      height: 88,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagline: {
      marginTop: 18,
      fontSize: 11,
      letterSpacing: 2.6,
      fontWeight: '600',
      textTransform: 'uppercase',
      color: colors.muted2,
      textAlign: 'center',
    },
  }));

  return (
    <View style={styles.hero}>
      <View style={styles.logoWrap}>
        <Brandmark size={88} />
      </View>
      <Text style={styles.tagline}>Stop overthinking.</Text>
    </View>
  );
}

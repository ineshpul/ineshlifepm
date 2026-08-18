import * as React from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { PrimaryButton } from './PrimaryButton';
import { useThemedStyles } from '../theme/ThemeProvider';
import { typography } from '../theme/typography';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = {
  /** When true, animates the bar out (graduation / tier transition). */
  dissolving?: boolean;
};

export function FeedTeaserWallBar({ dissolving = false }: Props) {
  const nav = useNavigation<any>();
  const opacity = React.useRef(new Animated.Value(1)).current;
  const translateY = React.useRef(new Animated.Value(0)).current;

  const styles = useThemedStyles(() => ({
    bar: {
      marginHorizontal: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: 'rgba(10, 17, 12, 0.78)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    lockBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.10)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    textCol: {
      flex: 1,
      gap: 8,
    },
    title: {
      fontSize: 14,
      fontFamily: typography.bodyBold,
      color: '#FFFFFF',
      lineHeight: 19,
    },
    cta: {
      width: '100%',
      maxWidth: 200,
      borderRadius: 28,
      height: 44,
    },
  }));

  React.useEffect(() => {
    if (!dissolving) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 480,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -12,
        duration: 480,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [dissolving, opacity, translateY]);

  return (
    <Animated.View style={[styles.bar, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.lockBox}>
        <Ionicons name="lock-closed-outline" size={22} color="#8FE3A8" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.title}>Post today&apos;s Leap to keep going.</Text>
        <PrimaryButton
          title="Leap"
          variant="green"
          onPress={() => navigateToRecord(nav)}
          style={styles.cta}
        />
      </View>
    </Animated.View>
  );
}

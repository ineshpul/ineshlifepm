import * as React from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';

import { typography } from '../../theme/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';

type Props = {
  active: 'daily' | 'best';
  onDailyPress: () => void;
  onBestPress: () => void;
  style?: ViewStyle;
};

export function ModernFeedModeSwitch({
  active,
  onDailyPress,
  onBestPress,
  style,
}: Props) {
  const styles = useThemedStyles(() => ({
    root: {
      alignSelf: 'center' as const,
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 24,
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 7,
      borderRadius: 20,
      backgroundColor: 'rgba(15, 24, 18, 0.44)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.14)',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    tab: {
      alignItems: 'center' as const,
      minHeight: 32,
    },
    label: {
      color: 'rgba(255,255,255,0.58)',
      fontFamily: typography.bodySemiBold,
      fontSize: 15,
      letterSpacing: -0.2,
    },
    labelActive: {
      color: '#FFFFFF',
      fontFamily: typography.bodyBold,
    },
    indicator: {
      width: '100%' as const,
      minWidth: 28,
      height: 3,
      marginTop: 6,
      borderRadius: 2,
      backgroundColor: '#FFFFFF',
    },
  }));

  return (
    <View style={[styles.root, style]}>
      <Pressable
        style={styles.tab}
        onPress={onDailyPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'daily' }}
      >
        <Text style={[styles.label, active === 'daily' && styles.labelActive]}>Daily Leaps</Text>
        {active === 'daily' ? <View style={styles.indicator} /> : null}
      </Pressable>
      <Pressable
        style={styles.tab}
        onPress={onBestPress}
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'best' }}
      >
        <Text style={[styles.label, active === 'best' && styles.labelActive]}>
          Best of the Day
        </Text>
        {active === 'best' ? <View style={styles.indicator} /> : null}
      </Pressable>
    </View>
  );
}

import * as React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { typography } from '../../theme/typography';
import { useThemedStyles } from '../../theme/ThemeProvider';

type Props = {
  active: 'daily' | 'best';
  onDailyPress: () => void;
  onBestPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ModernFeedModeSwitch({
  active,
  onDailyPress,
  onBestPress,
  style,
}: Props) {
  const styles = useThemedStyles(() => ({
    /** Full-width host so the pill stays optically centered whatever the label widths are. */
    host: {
      alignItems: 'center' as const,
    },
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 6,
      paddingTop: 8,
      paddingBottom: 6,
      borderRadius: 22,
      backgroundColor: 'rgba(10, 17, 12, 0.34)',
    },
    tab: {
      alignItems: 'center' as const,
      justifyContent: 'flex-start' as const,
      paddingHorizontal: 14,
    },
    label: {
      color: 'rgba(255,255,255,0.66)',
      fontFamily: typography.bodySemiBold,
      fontSize: 15,
      letterSpacing: -0.2,
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4,
    },
    labelActive: {
      color: '#FFFFFF',
      fontFamily: typography.bodyBold,
    },
    /** Always present so switching tabs never nudges the labels up or down. */
    indicator: {
      width: 22,
      height: 2.5,
      marginTop: 6,
      borderRadius: 2,
      backgroundColor: 'transparent',
    },
    indicatorActive: {
      backgroundColor: '#FFFFFF',
    },
  }));

  return (
    <View style={[styles.host, style]} pointerEvents="box-none">
      <View style={styles.pill}>
        <Pressable
          style={styles.tab}
          onPress={onDailyPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === 'daily' }}
        >
          <Text style={[styles.label, active === 'daily' && styles.labelActive]}>Daily Leaps</Text>
          <View style={[styles.indicator, active === 'daily' && styles.indicatorActive]} />
        </Pressable>
        <Pressable
          style={styles.tab}
          onPress={onBestPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === 'best' }}
        >
          <Text style={[styles.label, active === 'best' && styles.labelActive]}>BPOTD</Text>
          <View style={[styles.indicator, active === 'best' && styles.indicatorActive]} />
        </Pressable>
      </View>
    </View>
  );
}

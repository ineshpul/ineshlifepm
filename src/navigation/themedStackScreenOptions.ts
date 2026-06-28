import { Platform } from 'react-native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { useTheme } from '../theme/ThemeProvider';

/** Shared native-stack header styling for dark/light mode. */
export function useThemedStackScreenOptions(): NativeStackNavigationOptions {
  const { colors } = useTheme();
  return {
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '800', color: colors.text },
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
    headerBackTitleVisible: false,
    ...(Platform.OS === 'ios' ? { headerBackTitle: '' } : {}),
    contentStyle: { backgroundColor: colors.bg },
  };
}

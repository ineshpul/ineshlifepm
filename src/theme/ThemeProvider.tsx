import * as React from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useSettingsPreferences } from '../state/settingsPreferences';
import { darkColors, lightColors, type AppColors } from './colors';

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

type ThemeContextValue = {
  colors: AppColors;
  isDark: boolean;
};

const ThemeContext = React.createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { preferences, ready } = useSettingsPreferences();
  const isDark = ready && preferences.darkMode;
  const colors = isDark ? darkColors : lightColors;

  const value = React.useMemo(() => ({ colors, isDark }), [colors, isDark]);

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return React.useContext(ThemeContext);
}

export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (colors: AppColors) => T
): T {
  const { colors } = useTheme();
  return React.useMemo(() => StyleSheet.create(factory(colors)), [colors, factory]);
}

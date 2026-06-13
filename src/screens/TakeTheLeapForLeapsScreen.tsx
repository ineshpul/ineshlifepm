import * as React from 'react';
import { Text, View, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { Screen } from '../components/Screen';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { MainStackParamList } from '../navigation/types';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = NativeStackScreenProps<MainStackParamList, 'TakeTheLeapForLeaps'>;

export function TakeTheLeapForLeapsScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: {
      flex: 1,
      paddingHorizontal: 22,
    },
    inner: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 14,
      paddingBottom: 40,
    },
    subtitle: {
      fontSize: 18,
      lineHeight: 26,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      maxWidth: 320,
    },
    leapFab: {
      marginTop: 18,
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.moss,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 4,
    },
    leapFabPressed: {
      opacity: 0.92,
    },
    hint: {
      marginTop: 4,
      fontSize: 13,
      fontWeight: '700',
      color: colors.muted,
    },
  }));
  const raw = String(route.params.username ?? 'user').replace(/^@+/u, '').trim() || 'user';
  const handle = `@${raw}`;

  return (
    <Screen style={styles.screen} edges={['bottom', 'left', 'right']}>
      <View style={styles.inner}>
        <Text style={styles.subtitle}>
          If you want to view {handle}
          &apos;s leaps
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open camera to record a leap"
          onPress={() => navigateToRecord(navigation)}
          style={({ pressed }) => [styles.leapFab, pressed && styles.leapFabPressed]}
        >
          <Ionicons name="videocam" size={34} color={colors.white} />
        </Pressable>
        <Text style={styles.hint}>Tap to open the camera</Text>
      </View>
    </Screen>
  );
}

import * as React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from './Screen';
import { PrimaryButton } from './PrimaryButton';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { FEED_PREVIEW_SCROLL_LIMIT } from '../constants/feedPreview';
import { floatingTabContentClearance } from '../navigation/tabBarMetrics';

type Props = {
  onPreview: () => void;
  onSkip: () => void;
  previewDisabled?: boolean;
};

/**
 * Gate on the feed tab before the user starts their one daily preview or skips to record.
 */
export function FeedPreviewChoice({ onPreview, onSkip, previewDisabled }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    screen: {
      flex: 1,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    lockIcon: {
      width: 64,
      height: 64,
      borderRadius: 16,
      backgroundColor: colors.cardTint,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.muted,
      textAlign: 'center',
      lineHeight: 20,
      maxWidth: 280,
      marginBottom: 4,
    },
    hintText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted2,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 260,
    },
    actions: {
      width: '100%',
      maxWidth: 240,
      gap: 10,
      marginTop: 8,
    },
    cta: {
      width: '100%',
      borderRadius: 28,
    },
  }));
  const bottomPad = floatingTabContentClearance(insets.bottom);

  return (
    <Screen style={[styles.screen, { paddingBottom: bottomPad }]}>
      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed-outline" size={28} color={colors.green} />
      </View>

      <Text style={styles.title}>Feed locked</Text>
      <Text style={styles.subtitle}>
        Preview up to {FEED_PREVIEW_SCROLL_LIMIT} leaps today, or post yours to unlock the full feed.
      </Text>

      {previewDisabled ? (
        <Text style={styles.hintText}>No leaps to preview yet — take yours or check back soon.</Text>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          title={`Preview ${FEED_PREVIEW_SCROLL_LIMIT} leaps`}
          variant="green"
          onPress={onPreview}
          disabled={previewDisabled}
          style={styles.cta}
        />
        <PrimaryButton title="Take leap" variant="outline" onPress={onSkip} style={styles.cta} />
      </View>
    </Screen>
  );
}

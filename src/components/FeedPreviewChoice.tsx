import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { Screen } from './Screen';
import { PrimaryButton } from './PrimaryButton';
import { Brandmark } from './Brandmark';
import { colors } from '../theme/colors';
import { FEED_PREVIEW_SCROLL_LIMIT } from '../constants/feedPreview';
import { navigateToRecord } from '../navigation/navigationHelpers';

type Props = {
  onPreview: () => void;
  onSkip: () => void;
  previewDisabled?: boolean;
};

/**
 * Shown each feed visit before post until the user starts a preview or skips for the day.
 */
export function FeedPreviewChoice({ onPreview, onSkip, previewDisabled }: Props) {
  const nav = useNavigation<any>();

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Brandmark size={36} />
        <Text style={styles.headerTitle}>Daily Leaps</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>See what others leaped?</Text>
        <Text style={styles.body}>
          Tap preview to watch up to {FEED_PREVIEW_SCROLL_LIMIT} leaps now — that uses your one preview for
          today, even if you leave early. Post yours to unlock the full feed.
        </Text>
        {previewDisabled ? (
          <Text style={styles.hint}>No leaps to preview yet — record yours or check back soon.</Text>
        ) : null}

        <PrimaryButton
          title={`Preview ${FEED_PREVIEW_SCROLL_LIMIT} leaps`}
          variant="green"
          onPress={onPreview}
          disabled={previewDisabled}
          style={styles.primaryBtn}
        />
        <PrimaryButton
          title="Skip — take my leap"
          variant="outline"
          onPress={onSkip}
          style={styles.secondaryBtn}
        />
        <PrimaryButton
          title="Record now"
          variant="outline"
          onPress={() => navigateToRecord(nav)}
          style={styles.secondaryBtn}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
  },
  card: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 48,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(251, 191, 36, 0.95)',
    textAlign: 'center',
    lineHeight: 18,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 30,
    marginTop: 8,
  },
  secondaryBtn: {
    width: '100%',
    borderRadius: 14,
  },
});

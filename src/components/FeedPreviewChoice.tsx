import * as React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from './Screen';
import { PrimaryButton } from './PrimaryButton';
import { Brandmark } from './Brandmark';
import { colors } from '../theme/colors';
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
  const bottomPad = floatingTabContentClearance(insets.bottom);

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Brandmark size={36} />
            <View>
              <Text style={styles.headerTitle}>Daily Leaps</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={[styles.body, { paddingBottom: bottomPad }]}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>FEED PREVIEW</Text>
          </View>

          <Text style={styles.title}>See what others leaped?</Text>
          <Text style={styles.bodyCopy}>
            You get one preview today — up to {FEED_PREVIEW_SCROLL_LIMIT} leaps. Post yours to unlock
            everyone&apos;s feed.
          </Text>

          <View style={styles.stepsRow}>
            <View style={styles.step}>
              <View style={[styles.stepIcon, styles.stepIconActive]}>
                <Ionicons name="eye-outline" size={16} color={colors.green} />
              </View>
              <Text style={styles.stepLabel}>Preview</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name="videocam-outline" size={16} color={colors.muted} />
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelMuted]}>Post</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name="infinite-outline" size={16} color={colors.muted} />
              </View>
              <Text style={[styles.stepLabel, styles.stepLabelMuted]}>Full feed</Text>
            </View>
          </View>

          {previewDisabled ? (
            <View style={styles.hintBanner}>
              <Ionicons name="information-circle-outline" size={18} color={colors.moss} />
              <Text style={styles.hintText}>
                No leaps to preview yet — take yours or check back soon.
              </Text>
            </View>
          ) : null}

          <View style={styles.cardActions}>
            <PrimaryButton
              title={`Preview ${FEED_PREVIEW_SCROLL_LIMIT} leaps`}
              variant="green"
              onPress={onPreview}
              disabled={previewDisabled}
              style={styles.primaryBtn}
            />
            <TouchableOpacity
              onPress={onSkip}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip preview and take my leap"
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>Skip — take my leap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  headerWrap: {
    paddingHorizontal: 12,
  },
  header: {
    paddingTop: 6,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
  },
  body: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  card: {
    borderRadius: 22,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.moss,
  },
  badgeText: {
    fontSize: 11,
    letterSpacing: 1.4,
    fontWeight: '900',
    color: colors.green,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  bodyCopy: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 20,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingVertical: 4,
  },
  step: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  stepIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#E6F4D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconActive: {
    borderColor: colors.moss,
    backgroundColor: '#E8F5E9',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.green,
  },
  stepLabelMuted: {
    color: colors.muted,
  },
  stepLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E6F4D7',
    marginHorizontal: 6,
    marginBottom: 18,
  },
  hintBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 18,
  },
  cardActions: {
    marginTop: 4,
    gap: 2,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#DCEFD4',
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 30,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.muted,
  },
});

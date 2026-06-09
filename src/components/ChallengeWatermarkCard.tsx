import * as React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { colors } from '../theme/colors';

export type ChallengeWatermarkCardProps = {
  title: string;
};

/** Full-width capture canvas — scaled for 1080p burn-in (~feed bottom-sheet legibility). */
const CARD_WIDTH = 1080;
const TAGLINE = 'Take that Leap';

function titleTypography(title: string): Pick<TextStyle, 'fontSize' | 'lineHeight'> {
  const len = title.trim().length;
  if (len <= 48) return { fontSize: 36, lineHeight: 42 };
  if (len <= 72) return { fontSize: 30, lineHeight: 36 };
  if (len <= 96) return { fontSize: 26, lineHeight: 32 };
  return { fontSize: 22, lineHeight: 28 };
}

/** Camera-roll export strip — feed-style card burned onto the bottom of saved videos. */
export function ChallengeWatermarkCard({ title }: ChallengeWatermarkCardProps) {
  const titleType = titleTypography(title);
  const displayTitle = title.trim() || "Today's leap";

  return (
    <View style={styles.card}>
      <Text style={styles.brand}>Leap</Text>
      <Text style={[styles.title, titleType]} numberOfLines={2}>
        {displayTitle}
      </Text>
      <View style={styles.taglineRow}>
        <View style={styles.taglineDot} />
        <Text style={styles.tagline}>{TAGLINE}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 22,
    paddingTop: 14,
    paddingBottom: 18,
  },
  brand: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    color: colors.moss,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.4,
  },
  taglineRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taglineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.moss,
  },
  tagline: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
    color: colors.green,
    letterSpacing: 0.2,
  },
});

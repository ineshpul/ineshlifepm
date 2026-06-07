import * as React from 'react';
import { StyleSheet, Text, View, type TextStyle } from 'react-native';

import { colors } from '../theme/colors';

export type ChallengeWatermarkCardProps = {
  title: string;
};

/** Full-width capture canvas — height stays minimal so the burned-in strip is tiny on video. */
const CARD_WIDTH = 1080;
const TAGLINE = 'Take that Leap';

function titleTypography(title: string): Pick<TextStyle, 'fontSize' | 'lineHeight'> {
  const len = title.trim().length;
  if (len <= 48) return { fontSize: 22, lineHeight: 26 };
  if (len <= 72) return { fontSize: 19, lineHeight: 23 };
  if (len <= 96) return { fontSize: 17, lineHeight: 21 };
  return { fontSize: 15, lineHeight: 19 };
}

/** Minimal legible strip — camera-roll export only (never uploaded to the feed). */
export function ChallengeWatermarkCard({ title }: ChallengeWatermarkCardProps) {
  const titleType = titleTypography(title);
  const displayTitle = title.trim() || "Today's leap";

  return (
    <View style={styles.card}>
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
    backgroundColor: 'rgba(241, 248, 233, 0.88)',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 7,
  },
  title: {
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  taglineRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taglineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.moss,
  },
  tagline: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '700',
    color: colors.green,
    letterSpacing: 0.1,
  },
});

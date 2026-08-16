import * as React from 'react';
import { Text, View, type TextStyle } from 'react-native';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';

type Props = {
  label: string;
  /** Countdown copy, e.g. "02:57:14 left". */
  timeLabel: string;
  /** Live windows get the coral pulse dot; pre-drop stays muted. */
  live: boolean;
};

/** HH:MM:SS countdown shared by the Today hero and the create sheet. */
export function formatCountdownHMS(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "TODAY'S LEAP ——— 02:57:14 left" rule from mockup 01. */
export function ModernPromptEyebrow({ label, timeLabel, live }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
    },
    label: {
      fontFamily: typography.bodyBold,
      fontSize: 11.5,
      letterSpacing: 2.2,
      color: c.green,
    },
    rule: {
      flex: 1,
      height: 1,
      borderRadius: 1,
      backgroundColor: c.profileAccentBorder,
    },
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 11,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.card,
      flexShrink: 0,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    time: {
      fontFamily: typography.bodyBold,
      fontSize: 12.5,
      color: c.text,
      fontVariant: ['tabular-nums'] as TextStyle['fontVariant'],
    },
  }));

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.rule} />
      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: live ? colors.coral : colors.muted2 }]} />
        <Text style={styles.time}>{timeLabel}</Text>
      </View>
    </View>
  );
}

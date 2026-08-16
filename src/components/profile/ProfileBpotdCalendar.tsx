import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import type { BestPartPost } from '../../types/bestPart';
import { nyDateKey } from '../../utils/nyTime';
import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function keyFor(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function ProfileBpotdCalendar({
  posts,
  onOpenPost,
}: {
  posts: BestPartPost[];
  onOpenPost: (bestPartId: string) => void;
}) {
  const todayParts = nyDateKey().split('-').map(Number);
  const [visibleMonth, setVisibleMonth] = React.useState(
    () => new Date(Date.UTC(todayParts[0]!, todayParts[1]! - 1, 1))
  );
  const year = visibleMonth.getUTCFullYear();
  const month = visibleMonth.getUTCMonth();
  const postByDate = React.useMemo(
    () => new Map(posts.filter((post) => !post.deleted).map((post) => [post.dateKey, post])),
    [posts]
  );
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) =>
    index < firstWeekday ? null : index - firstWeekday + 1
  );
  while (cells.length % 7 !== 0) cells.push(null);

  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    card: {
      marginTop: 12,
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border2,
      backgroundColor: c.card,
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 12,
    },
    month: { fontFamily: typography.displayExtraBold, fontSize: 18, color: c.text },
    nav: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
    },
    navButton: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.cardTint,
    },
    weekRow: { flexDirection: 'row' as const, marginBottom: 5 },
    weekday: {
      width: `${100 / 7}%` as const,
      textAlign: 'center' as const,
      color: c.muted2,
      fontFamily: typography.bodyBold,
      fontSize: 10,
    },
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const },
    cellWrap: { width: `${100 / 7}%` as const, padding: 2 },
    cell: {
      aspectRatio: 1,
      borderRadius: 10,
      overflow: 'hidden' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.inputBg,
    },
    filled: { borderWidth: 2, borderColor: c.moss },
    image: { width: '100%' as const, height: '100%' as const },
    shade: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    day: { fontFamily: typography.bodySemiBold, fontSize: 11, color: c.muted },
    filledDay: {
      position: 'absolute' as const,
      left: 5,
      bottom: 4,
      color: '#fff',
      fontFamily: typography.bodyExtraBold,
      fontSize: 10,
    },
  }));

  const moveMonth = (delta: number) => {
    setVisibleMonth(new Date(Date.UTC(year, month + delta, 1)));
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.month}>
          {new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
            visibleMonth
          )}
        </Text>
        <View style={styles.nav}>
          <Pressable style={styles.navButton} onPress={() => moveMonth(-1)} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable style={styles.navButton} onPress={() => moveMonth(1)} accessibilityLabel="Next month">
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((label, index) => (
          <Text key={`${label}-${index}`} style={styles.weekday}>{label}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, index) => {
          const post = day ? postByDate.get(keyFor(year, month, day)) : undefined;
          const preview = String(post?.posterUrl || post?.feedUrl || post?.url || '').trim();
          return (
            <View key={`${year}-${month}-${index}`} style={styles.cellWrap}>
              {day ? (
                <Pressable
                  style={[styles.cell, post && styles.filled]}
                  onPress={post ? () => onOpenPost(post.id) : undefined}
                  disabled={!post}
                  accessibilityRole={post ? 'button' : undefined}
                  accessibilityLabel={post ? `Open BPOTD for ${post.dateKey}` : undefined}
                >
                  {post && preview ? <Image source={{ uri: preview }} style={styles.image} contentFit="cover" /> : null}
                  {post ? <View style={styles.shade} /> : null}
                  <Text style={post ? styles.filledDay : styles.day}>{day}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

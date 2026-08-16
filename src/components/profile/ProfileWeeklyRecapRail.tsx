import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';

import { bestPartWeekStartForDateKey, weekRangeLabel, bestPartWeekDateKeys } from '../../lib/bestPartWeek';
import { navigateToBestPartWeekRecap } from '../../navigation/navigationHelpers';
import type { BestPartPost } from '../../types/bestPart';
import { useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';

type WeekGroup = { weekStartKey: string; posts: BestPartPost[] };

export function ProfileWeeklyRecapRail({
  posts,
  username,
}: {
  posts: BestPartPost[];
  username: string;
}) {
  const navigation = useNavigation<any>();
  const weeks = React.useMemo(() => {
    const grouped = new Map<string, BestPartPost[]>();
    posts
      .filter((post) => !post.deleted)
      .forEach((post) => {
        const weekStartKey = bestPartWeekStartForDateKey(post.dateKey);
        if (!weekStartKey) return;
        const group = grouped.get(weekStartKey) ?? [];
        group.push(post);
        grouped.set(weekStartKey, group);
      });
    return Array.from(grouped, ([weekStartKey, groupPosts]) => ({
      weekStartKey,
      posts: groupPosts.sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    })).sort((a, b) => b.weekStartKey.localeCompare(a.weekStartKey)) as WeekGroup[];
  }, [posts]);

  const styles = useThemedStyles((c) => ({
    section: { marginTop: 18 },
    title: {
      marginBottom: 10,
      fontFamily: typography.bodyBold,
      fontSize: 11,
      letterSpacing: 1.5,
      color: c.muted2,
    },
    content: { gap: 10, paddingRight: 12 },
    card: {
      width: 152,
      padding: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border2,
      backgroundColor: c.card,
    },
    cover: {
      height: 108,
      borderRadius: 11,
      overflow: 'hidden' as const,
      backgroundColor: c.cardTint,
    },
    image: { width: '100%' as const, height: '100%' as const },
    count: {
      position: 'absolute' as const,
      right: 7,
      bottom: 7,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 4,
      backgroundColor: 'rgba(0,0,0,0.7)',
    },
    countText: { color: '#fff', fontFamily: typography.bodyBold, fontSize: 10 },
    label: { marginTop: 8, fontFamily: typography.bodyBold, fontSize: 12, color: c.text },
    empty: { fontFamily: typography.bodyMedium, fontSize: 13, color: c.muted },
  }));

  if (weeks.length === 0) {
    return (
      <View style={styles.section}>
        <Text style={styles.title}>WEEKLY RECAPS</Text>
        <Text style={styles.empty}>Weeks with BPOTD posts will collect here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.title}>WEEKLY RECAPS</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
        {weeks.map((week) => {
          const first = week.posts[0]!;
          const preview = String(first.posterUrl || first.feedUrl || first.url || '').trim();
          return (
            <Pressable
              key={week.weekStartKey}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.84 }]}
              onPress={() =>
                navigateToBestPartWeekRecap(navigation, {
                  username,
                  weekStartKey: week.weekStartKey,
                  posts: week.posts.map((post) => ({
                    id: post.id,
                    dateKey: post.dateKey,
                    caption: post.caption,
                    mediaType: post.mediaType,
                    url: post.url,
                    feedUrl: post.feedUrl,
                  })),
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open recap for week of ${week.weekStartKey}`}
            >
              <View style={styles.cover}>
                {preview ? <Image source={{ uri: preview }} style={styles.image} contentFit="cover" /> : null}
                <View style={styles.count}>
                  <Text style={styles.countText}>{week.posts.length} days</Text>
                </View>
              </View>
              <Text style={styles.label} numberOfLines={1}>
                {weekRangeLabel(bestPartWeekDateKeys(week.weekStartKey))}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

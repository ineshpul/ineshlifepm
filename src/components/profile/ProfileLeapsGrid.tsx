import * as React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import { typography } from '../../theme/typography';

export type ProfileLeapGridItem = {
  id: string;
  posterUrl?: string;
  leapInches?: number;
};

export function ProfileLeapsGrid({
  videos,
  onOpen,
}: {
  videos: ProfileLeapGridItem[];
  onOpen: (videoId: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, paddingTop: 4 },
    tile: {
      width: '32.4%' as const,
      aspectRatio: 0.78,
      borderRadius: 10,
      overflow: 'hidden' as const,
      backgroundColor: c.cardTint,
      borderWidth: 1,
      borderColor: c.border2,
    },
    image: { width: '100%' as const, height: '100%' as const },
    placeholder: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.cardTint,
    },
    badge: {
      position: 'absolute' as const,
      left: 6,
      bottom: 6,
      borderRadius: 8,
      paddingHorizontal: 7,
      paddingVertical: 4,
      backgroundColor: 'rgba(0,0,0,0.72)',
    },
    badgeText: { color: '#fff', fontFamily: typography.bodyBold, fontSize: 10 },
    empty: {
      width: '100%' as const,
      paddingVertical: 30,
      alignItems: 'center' as const,
      borderRadius: 16,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.border2,
    },
    emptyText: { fontFamily: typography.bodySemiBold, fontSize: 13, color: c.muted },
  }));

  if (videos.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Your leap videos will appear here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {videos.map((video) => {
        const posterUrl = String(video.posterUrl ?? '').trim();
        const inches = Number(video.leapInches ?? 0);
        return (
          <Pressable
            key={video.id}
            style={({ pressed }) => [styles.tile, pressed && { opacity: 0.82 }]}
            onPress={() => onOpen(video.id)}
            accessibilityRole="button"
            accessibilityLabel="Open leap video"
          >
            {posterUrl ? (
              <Image source={{ uri: posterUrl }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={styles.placeholder}>
                <Ionicons name="play" size={24} color={colors.muted2} />
              </View>
            )}
            {Number.isFinite(inches) && inches > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{Math.round(inches)} in</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

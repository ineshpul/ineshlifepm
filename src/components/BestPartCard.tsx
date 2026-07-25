import * as React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

import { BestPartEngagement } from './BestPartEngagement';
import { UsernameLink } from './UsernameLink';
import { useAuth } from '../state/auth';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { BestPartPost } from '../types/bestPart';
import { formatNyDateKeyShort, nyDateKey } from '../utils/nyTime';

function formatRelative(createdAt: unknown): string {
  const ms =
    createdAt && typeof createdAt === 'object' && 'toMillis' in createdAt
      ? Number((createdAt as { toMillis: () => number }).toMillis())
      : typeof createdAt === 'number'
        ? createdAt
        : 0;
  if (!ms) return '';
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatNyDateKeyShort(
    `${new Date(ms).getFullYear()}-${String(new Date(ms).getMonth() + 1).padStart(2, '0')}-${String(new Date(ms).getDate()).padStart(2, '0')}`
  );
}

function dayLabel(dateKey: string): string {
  const today = nyDateKey();
  if (dateKey === today) return `TODAY · ${formatNyDateKeyShort(dateKey).toUpperCase()}`;
  return formatNyDateKeyShort(dateKey).toUpperCase();
}

type Props = {
  post: BestPartPost;
  showOwner?: boolean;
};

export function BestPartCard({ post, showOwner = true }: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [playing, setPlaying] = React.useState(false);
  const styles = useThemedStyles((c) => ({
    card: {
      borderRadius: 22,
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.profileAccentBorder,
      overflow: 'hidden',
      marginBottom: 14,
    },
    mediaWrap: {
      width: '100%' as const,
      aspectRatio: 4 / 5,
      backgroundColor: '#111',
      overflow: 'hidden' as const,
    },
    media: { width: '100%' as const, height: '100%' as const },
    playBtn: {
      ...({ position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 }),
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, gap: 8 },
    metaRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: 8,
    },
    day: {
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1.2,
      color: c.moss,
    },
    badge: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: c.cardTint,
    },
    badgeText: { fontSize: 11, fontWeight: '700' as const, color: c.muted2 },
    caption: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, color: c.text },
    footer: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginTop: 2,
    },
    ownerRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, flex: 1 },
    ownerName: { fontSize: 14, fontWeight: '800' as const },
    relative: { fontSize: 12, color: c.muted2, fontWeight: '600' as const },
    duration: {
      position: 'absolute' as const,
      right: 10,
      bottom: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    durationText: { color: '#fff', fontSize: 12, fontWeight: '700' as const },
    pip: {
      position: 'absolute' as const,
      top: 12,
      right: 12,
      width: 88,
      height: 118,
      borderRadius: 12,
      overflow: 'hidden' as const,
      borderWidth: 2,
      borderColor: '#fff',
      backgroundColor: '#000',
    },
  }));

  const relative = formatRelative(post.createdAt);

  return (
    <View style={styles.card}>
      <View style={styles.mediaWrap}>
        {post.mediaType === 'photo' ? (
          <Image source={{ uri: post.url }} style={styles.media} resizeMode="cover" />
        ) : (
          <>
            <Video
              source={{ uri: post.url }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay={playing}
              isLooping
              useNativeControls={false}
            />
            {!playing ? (
              <Pressable style={styles.playBtn} onPress={() => setPlaying(true)} accessibilityLabel="Play">
                <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.92)" />
              </Pressable>
            ) : (
              <Pressable style={styles.playBtn} onPress={() => setPlaying(false)} accessibilityLabel="Pause" />
            )}
            {typeof post.durationSeconds === 'number' ? (
              <View style={styles.duration}>
                <Text style={styles.durationText}>
                  0:{String(Math.max(1, Math.round(post.durationSeconds))).padStart(2, '0')}
                </Text>
              </View>
            ) : null}
          </>
        )}
        {post.secondaryUrl ? (
          <View style={styles.pip}>
            <Video
              source={{ uri: post.secondaryUrl }}
              style={styles.media}
              resizeMode={ResizeMode.COVER}
              shouldPlay={playing || post.mediaType === 'photo'}
              isLooping
              isMuted
              useNativeControls={false}
            />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.day}>{dayLabel(post.dateKey)}</Text>
          {post.isPrivate ? (
            <View style={styles.badge}>
              <Ionicons name="lock-closed" size={12} color={colors.muted2} />
              <Text style={styles.badgeText}>Private</Text>
            </View>
          ) : post.mediaType === 'photo' ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Photo</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.caption}>{post.caption}</Text>

        <View style={styles.footer}>
          {showOwner ? (
            <View style={styles.ownerRow}>
              <UsernameLink uid={post.uid} username={post.username} style={styles.ownerName} />
              {relative ? <Text style={styles.relative}>· {relative}</Text> : null}
            </View>
          ) : relative ? (
            <Text style={styles.relative}>{relative}</Text>
          ) : (
            <View />
          )}
        </View>

        <BestPartEngagement
          bestPartId={post.id}
          ownerUid={post.uid}
          viewerUid={user?.uid}
          viewerUsername={user?.username ?? 'user'}
          initialLikesCount={post.likesCount}
          initialCommentsCount={post.commentsCount}
        />
      </View>
    </View>
  );
}

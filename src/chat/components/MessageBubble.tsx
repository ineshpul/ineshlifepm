import * as React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

import { useTheme, useThemedStyles } from '../../theme/ThemeProvider';
import type { ChatMessage } from '../types';

export type ReactionChip = { emoji: string; count: number; mine?: boolean };

type Props = {
  message: ChatMessage;
  mine: boolean;
  myUid?: string;
  reactions?: ReactionChip[];
  onLongPress: () => void;
  onOpenVideo: (url: string) => void;
  onOpenImage: (url: string) => void;
  onToggleReaction: (emoji: string, mine: boolean) => void;
};

function MessageBubbleInner({
  message,
  mine,
  myUid,
  reactions,
  onLongPress,
  onOpenVideo,
  onOpenImage,
  onToggleReaction,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    bubble: {
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
    },
    bubbleMine: {
      backgroundColor: c.moss,
      borderColor: c.moss,
    },
    bubbleTheirs: {
      backgroundColor: c.card,
      borderColor: c.border2,
    },
    bubbleTxt: { fontSize: 16, fontWeight: '600' as const, color: c.text },
    bubbleTxtMine: { color: c.white },
    edited: { marginTop: 4, fontSize: 11, fontWeight: '700' as const, color: c.muted2 },
    editedMine: { color: 'rgba(255,255,255,0.75)' },
    replyPreview: {
      marginBottom: 4,
      padding: 6,
      borderRadius: 8,
      backgroundColor: mine ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)',
    },
    replyPrevTxt: {
      fontSize: 12,
      fontWeight: '600' as const,
      color: mine ? 'rgba(255,255,255,0.85)' : c.muted,
    },
    shareTag: {
      fontSize: 11,
      fontWeight: '900' as const,
      color: mine ? c.white : c.moss,
      letterSpacing: 0.6,
      opacity: mine ? 0.9 : 1,
    },
    shareTitle: {
      fontSize: 15,
      fontWeight: '800' as const,
      marginBottom: 6,
      color: mine ? c.white : c.text,
    },
    shareVideo: { width: 220, height: 280, borderRadius: 12, backgroundColor: c.black },
    thumb: { width: 220, height: 140, borderRadius: 12, backgroundColor: c.black },
    thumbPh: { alignItems: 'center' as const, justifyContent: 'center' as const },
    dur: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '800' as const,
      color: mine ? 'rgba(255,255,255,0.8)' : c.muted,
    },
    reactionRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4, marginTop: 4 },
    reactionRowMine: { justifyContent: 'flex-end' as const },
    reactionChipBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.06)',
    },
    reactionChip: { fontSize: 13, fontWeight: '700' as const, color: c.text },
    sending: { marginTop: 3, fontSize: 11, fontWeight: '600' as const, color: 'rgba(255,255,255,0.7)' },
    failed: { marginTop: 3, fontSize: 11, fontWeight: '700' as const, color: c.danger },
  }));

  return (
    <Pressable onLongPress={onLongPress}>
      {message.replyTo ? (
        <View style={styles.replyPreview}>
          <Text style={styles.replyPrevTxt} numberOfLines={2}>
            Replying to {message.replyTo.senderId === myUid ? 'you' : 'message'}:{' '}
            {message.replyTo.textSnippet}
          </Text>
        </View>
      ) : null}
      {message.sharePost ? (
        <TouchableOpacity
          style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
          onPress={() => message.sharePost?.videoUrl && onOpenVideo(message.sharePost.videoUrl)}
        >
          <Text style={styles.shareTag}>Shared leap</Text>
          <Text style={styles.shareTitle}>{message.sharePost.title || 'Video'}</Text>
          {message.sharePost.videoUrl ? (
            <Video
              source={{ uri: message.sharePost.videoUrl }}
              style={styles.shareVideo}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              useNativeControls
            />
          ) : null}
        </TouchableOpacity>
      ) : null}
      {message.attachments?.map((a) =>
        a.kind === 'video' ? (
          <TouchableOpacity
            key={a.id}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
            onPress={() => onOpenVideo(a.downloadUrl)}
          >
            {a.thumbnailUrl ? (
              <Image source={{ uri: a.thumbnailUrl }} style={styles.thumb} contentFit="cover" />
            ) : (
              <View style={[styles.thumb, styles.thumbPh]}>
                <Ionicons name="play-circle" size={40} color={colors.white} />
              </View>
            )}
            <Text style={styles.dur}>{a.durationSec ? `${a.durationSec}s` : 'Video'}</Text>
          </TouchableOpacity>
        ) : a.kind === 'image' ? (
          <TouchableOpacity
            key={a.id}
            style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}
            activeOpacity={0.85}
            onPress={() => onOpenImage(a.downloadUrl)}
            accessibilityRole="image"
            accessibilityLabel="View photo full screen"
          >
            <Image source={{ uri: a.downloadUrl }} style={styles.thumb} contentFit="cover" />
          </TouchableOpacity>
        ) : null
      )}
      {message.text ? (
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleTxt, mine && styles.bubbleTxtMine]}>{message.text}</Text>
          {message.editedAt ? (
            <Text style={[styles.edited, mine && styles.editedMine]}>Edited</Text>
          ) : null}
          {mine && message.deliveryState === 'optimistic' ? (
            <Text style={styles.sending}>Sending…</Text>
          ) : null}
          {mine && message.deliveryState === 'failed' ? (
            <Text style={styles.failed}>Failed to send</Text>
          ) : null}
        </View>
      ) : null}
      {reactions?.length ? (
        <View style={[styles.reactionRow, mine && styles.reactionRowMine]}>
          {reactions.map((r) => (
            <TouchableOpacity
              key={r.emoji}
              style={styles.reactionChipBtn}
              activeOpacity={0.75}
              onPress={() => onToggleReaction(r.emoji, Boolean(r.mine))}
            >
              <Text style={styles.reactionChip}>
                {r.emoji} {r.count}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

export const MessageBubble = React.memo(MessageBubbleInner);

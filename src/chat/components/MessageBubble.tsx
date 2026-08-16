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
  /** Keep left avatar rail for all incoming group bubbles (name/avatar on cluster start). */
  groupLayout?: boolean;
  /** Group chats: show who sent this (first bubble in a cluster). */
  showSenderMeta?: boolean;
  senderLabel?: string;
  senderAvatarUrl?: string | null;
  /** Resolve reply “Replying to X” with a username when available. */
  replySenderLabel?: string;
  reactions?: ReactionChip[];
  onLongPress: () => void;
  /** Double-tap the bubble to quick-react (e.g. heart). */
  onDoubleTap?: () => void;
  onOpenVideo: (url: string) => void;
  onOpenImage: (url: string) => void;
  onToggleReaction: (emoji: string, mine: boolean) => void;
};

function MessageBubbleInner({
  message,
  mine,
  myUid,
  groupLayout,
  showSenderMeta,
  senderLabel,
  senderAvatarUrl,
  replySenderLabel,
  reactions,
  onLongPress,
  onDoubleTap,
  onOpenVideo,
  onOpenImage,
  onToggleReaction,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((c) => ({
    wrap: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: 8 },
    wrapMine: { flexDirection: 'row-reverse' as const },
    avatarCol: { width: 28, alignItems: 'center' as const },
    avatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.cardTint,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      overflow: 'hidden' as const,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border2,
    },
    avatarImg: { width: 28, height: 28 },
    avatarTxt: { fontSize: 11, fontWeight: '900' as const, color: c.moss },
    avatarSpacer: { width: 28, height: 28 },
    col: { maxWidth: '100%' as const, flexShrink: 1 },
    senderName: {
      fontSize: 12,
      fontWeight: '800' as const,
      color: c.moss,
      marginBottom: 3,
      marginLeft: 4,
    },
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

  const label = (senderLabel ?? '').replace(/^@+/u, '').trim();
  const photo = (senderAvatarUrl ?? '').trim();
  const showAvatarRail = Boolean(groupLayout) && !mine;
  const showName = Boolean(showSenderMeta && label && !mine);
  const replyWho =
    message.replyTo?.senderId === myUid
      ? 'you'
      : (replySenderLabel || message.replyTo?.senderUsername || 'message').replace(/^@+/u, '');

  const lastTapRef = React.useRef(0);
  const onBubblePress = React.useCallback(() => {
    if (!onDoubleTap) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      onDoubleTap();
      return;
    }
    lastTapRef.current = now;
  }, [onDoubleTap]);

  const body = (
    <Pressable onLongPress={onLongPress} onPress={onDoubleTap ? onBubblePress : undefined} delayLongPress={320}>
      {showName ? <Text style={styles.senderName}>{label}</Text> : null}
      {message.replyTo ? (
        <View style={styles.replyPreview}>
          <Text style={styles.replyPrevTxt} numberOfLines={2}>
            Replying to {replyWho}: {message.replyTo.textSnippet}
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

  if (!showAvatarRail) {
    return body;
  }

  return (
    <View style={[styles.wrap, mine && styles.wrapMine]}>
      <View style={styles.avatarCol}>
        {showSenderMeta ? (
          <View style={styles.avatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Text style={styles.avatarTxt}>{(label || '?').slice(0, 1).toUpperCase()}</Text>
            )}
          </View>
        ) : (
          <View style={styles.avatarSpacer} />
        )}
      </View>
      <View style={styles.col}>{body}</View>
    </View>
  );
}

export const MessageBubble = React.memo(MessageBubbleInner);

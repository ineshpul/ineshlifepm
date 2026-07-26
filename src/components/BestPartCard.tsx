import * as React from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';

import { enterPlayback } from '../camera/audioSessionGate';
import { BestPartCaptionText } from './BestPartCaptionText';
import { BestPartEngagement } from './BestPartEngagement';
import { DualClipPlayback } from './DualClipPlayback';
import { UsernameLink } from './UsernameLink';
import { ensureBestPartLiked } from '../services/bestPartLikes';
import { useAuth } from '../state/auth';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import type { BestPartPost } from '../types/bestPart';
import { formatNyDateKeyShort, nyDateKey } from '../utils/nyTime';
import { showError } from '../utils/ui';

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

function BestPartSingleVideo({ uri, playing }: { uri: string; playing: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
    p.volume = 1;
    p.bufferOptions = {
      preferredForwardBufferDuration: 1,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.5,
    };
  });

  React.useEffect(() => {
    void enterPlayback();
  }, []);

  React.useEffect(() => {
    try {
      if (playing) {
        player.play();
      } else {
        player.pause();
      }
    } catch {
      /* ignore */
    }
  }, [playing, player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

type Props = {
  post: BestPartPost;
  showOwner?: boolean;
  /** Community feed autoplays; Mine starts paused. */
  autoPlay?: boolean;
  /** Mine only — tiny redo on today’s card. */
  onRetake?: () => void;
  /** Own post — delete from Mine or Community. */
  onDelete?: () => void;
  actionsDisabled?: boolean;
};

export function BestPartCard({
  post,
  showOwner = true,
  autoPlay = false,
  onRetake,
  onDelete,
  actionsDisabled = false,
}: Props) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [playing, setPlaying] = React.useState(autoPlay);
  const [holdPaused, setHoldPaused] = React.useState(false);
  const [heartBurst, setHeartBurst] = React.useState<{ x: number; y: number } | null>(null);
  const heartScale = React.useRef(new Animated.Value(0)).current;
  const heartOpacity = React.useRef(new Animated.Value(0)).current;
  const heartAnimRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const resumeAfterHoldRef = React.useRef(false);

  React.useEffect(() => {
    setPlaying(autoPlay);
    setHoldPaused(false);
  }, [autoPlay, post.id]);

  React.useEffect(
    () => () => {
      heartAnimRef.current?.stop();
    },
    []
  );

  const playHeartBurst = React.useCallback(
    (x: number, y: number) => {
      heartAnimRef.current?.stop();
      setHeartBurst({ x, y });
      heartScale.setValue(0.4);
      heartOpacity.setValue(0);
      heartAnimRef.current = Animated.parallel([
        Animated.sequence([
          Animated.spring(heartScale, {
            toValue: 1.12,
            friction: 5,
            tension: 140,
            useNativeDriver: true,
          }),
          Animated.timing(heartScale, {
            toValue: 1,
            duration: 140,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(heartOpacity, {
            toValue: 1,
            duration: 90,
            useNativeDriver: true,
          }),
          Animated.delay(420),
          Animated.timing(heartOpacity, {
            toValue: 0,
            duration: 260,
            useNativeDriver: true,
          }),
        ]),
      ]);
      heartAnimRef.current.start(({ finished }) => {
        if (finished) setHeartBurst(null);
      });
    },
    [heartOpacity, heartScale]
  );

  const onDoubleTapLike = React.useCallback(
    (x: number, y: number) => {
      playHeartBurst(x, y);
      if (!user?.uid) {
        showError('Sign in required', new Error('Log in to like moments.'));
        return;
      }
      void ensureBestPartLiked({
        bestPartId: post.id,
        viewerUid: user.uid,
        viewerUsername: user.username ?? 'user',
      }).catch(() => undefined);
    },
    [playHeartBurst, post.id, user?.uid, user?.username]
  );

  const effectivePlaying = playing && !holdPaused;

  const longPress = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(220)
        .onStart(() => {
          resumeAfterHoldRef.current = playing;
          setHoldPaused(true);
        })
        .onEnd(() => {
          setHoldPaused(false);
          if (resumeAfterHoldRef.current) setPlaying(true);
        })
        .onFinalize(() => {
          setHoldPaused(false);
        }),
    [playing]
  );

  const doubleTap = React.useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(280)
        .onEnd((e) => {
          onDoubleTapLike(e.x, e.y);
        }),
    [onDoubleTapLike]
  );

  const singleTap = React.useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(1)
        .onEnd(() => {
          // Mine starts paused — single tap toggles play. Community autoplays; tap does nothing.
          if (!autoPlay) setPlaying((p) => !p);
        }),
    [autoPlay]
  );

  const mediaGesture = React.useMemo(
    () => Gesture.Simultaneous(longPress, Gesture.Exclusive(doubleTap, singleTap)),
    [longPress, doubleTap, singleTap]
  );

  const styles = useThemedStyles((c) => ({
    card: {
      marginBottom: 28,
    },
    mediaWrap: {
      width: '100%' as const,
      aspectRatio: 4 / 5,
      backgroundColor: '#111',
      borderRadius: 18,
      overflow: 'hidden' as const,
    },
    media: { width: '100%' as const, height: '100%' as const },
    touchLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 4,
    },
    playHint: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      zIndex: 3,
    },
    heartBurst: {
      position: 'absolute' as const,
      width: 72,
      height: 72,
      marginLeft: -36,
      marginTop: -36,
      zIndex: 5,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    holdHint: {
      position: 'absolute' as const,
      alignSelf: 'center' as const,
      bottom: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.55)',
      zIndex: 5,
    },
    holdHintText: { color: '#fff', fontSize: 12, fontWeight: '700' as const },
    body: { paddingTop: 12, paddingBottom: 4, gap: 8 },
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
    hashtag: { fontSize: 16, lineHeight: 22, fontWeight: '800' as const, color: c.green },
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
    ownerActions: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 2,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    iconBtnDisabled: { opacity: 0.4 },
  }));

  const relative = formatRelative(post.createdAt);
  const isVideo = post.mediaType !== 'photo';
  const playUrl = (post.feedUrl || post.url).trim();
  const playSecondaryUrl = (post.feedSecondaryUrl || post.secondaryUrl || '').trim();

  return (
    <View style={styles.card}>
      <View style={styles.mediaWrap}>
        {post.mediaType === 'photo' ? (
          <Image source={{ uri: post.url }} style={styles.media} resizeMode="cover" />
        ) : playSecondaryUrl ? (
          <DualClipPlayback
            primaryUrl={playUrl}
            secondaryUrl={playSecondaryUrl}
            dualFrontIsPrimary={post.dualFrontIsPrimary}
            shouldPlay={effectivePlaying}
            isMuted={false}
            primaryContentFit="cover"
            replayOnEnd
            pipStyle={styles.pip}
          />
        ) : (
          <BestPartSingleVideo uri={playUrl} playing={effectivePlaying} />
        )}

        {isVideo && !effectivePlaying && !holdPaused ? (
          <View style={styles.playHint} pointerEvents="none">
            <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.92)" />
          </View>
        ) : null}

        <GestureDetector gesture={mediaGesture}>
          <View style={styles.touchLayer} accessibilityLabel="Double tap to like, hold to pause" />
        </GestureDetector>

        {heartBurst ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.heartBurst,
              {
                left: heartBurst.x,
                top: heartBurst.y,
                opacity: heartOpacity,
                transform: [{ scale: heartScale }],
              },
            ]}
          >
            <Ionicons name="heart" size={64} color={colors.coral} />
          </Animated.View>
        ) : null}

        {holdPaused ? (
          <View style={styles.holdHint} pointerEvents="none">
            <Text style={styles.holdHintText}>Paused</Text>
          </View>
        ) : null}

        {isVideo && typeof post.durationSeconds === 'number' ? (
          <View style={styles.duration} pointerEvents="none">
            <Text style={styles.durationText}>
              0:{String(Math.max(1, Math.round(post.durationSeconds))).padStart(2, '0')}
            </Text>
          </View>
        ) : null}

        {post.secondaryUrl && post.mediaType === 'photo' ? (
          <View style={styles.pip} pointerEvents="none">
            <Image source={{ uri: post.secondaryUrl }} style={styles.media} resizeMode="cover" />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={styles.day}>{dayLabel(post.dateKey)}</Text>
          <View style={styles.ownerActions}>
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
            {onRetake ? (
              <Pressable
                style={[styles.iconBtn, actionsDisabled && styles.iconBtnDisabled]}
                onPress={onRetake}
                disabled={actionsDisabled}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Redo today’s moment"
              >
                <Ionicons name="refresh" size={18} color={colors.green} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <BestPartCaptionText
          text={post.caption}
          style={styles.caption}
          hashtagStyle={styles.hashtag}
        />

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
          ownerUsername={post.username}
          mediaUrl={post.url}
          mediaType={post.mediaType}
          shareTitle={post.caption.trim() || 'Best part of the day'}
          viewerUid={user?.uid}
          viewerUsername={user?.username ?? 'user'}
          initialLikesCount={post.likesCount}
          initialCommentsCount={post.commentsCount}
          onDeleteOwn={onDelete}
          deleteBusy={actionsDisabled}
        />
      </View>
    </View>
  );
}

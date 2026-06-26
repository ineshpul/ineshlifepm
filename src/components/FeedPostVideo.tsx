import * as React from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { recordVideoView } from '../services/recordVideoView';
import { ensureVideoLiked } from '../services/videoLikes';

const HEART_BURST_SIZE = 96;

function formatTimeLeft(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Pause a reel neighbor so the next swipe can resume instantly (keep the native buffer). */
async function pauseVideoPlayer(player: Video | null, resetPosition: boolean) {
  if (!player) return;
  try {
    await player.pauseAsync();
    await player.setIsMutedAsync(true);
    await player.setVolumeAsync(0);
    if (resetPosition) await player.setPositionAsync(0);
  } catch {
    // native race
  }
}

/** Full teardown when the player unmounts (e.g. leaving the feed tab). */
async function unloadVideoPlayer(player: Video | null) {
  if (!player) return;
  try {
    await player.pauseAsync();
    await player.setIsMutedAsync(true);
    await player.setVolumeAsync(0);
    await player.unloadAsync();
  } catch {
    // native race
  }
}

/** Empty reel slot — same footprint as the player, without holding a native decoder. */
export function ReelVideoPlaceholder() {
  const styles = useFeedPostVideoStyles();
  return <View style={styles.videoStageReel} />;
}

function useFeedPostVideoStyles() {
  return useThemedStyles((colors) => ({
    videoStageReel: {
      ...StyleSheet.absoluteFillObject,
      overflow: 'hidden',
      backgroundColor: '#0B1020',
    },
    reelLoading: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    reelTouchLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 2,
    },
    heartBurst: {
      position: 'absolute',
      zIndex: 5,
      width: HEART_BURST_SIZE,
      height: HEART_BURST_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
    reelIconCenter: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.32)',
    },
    reelPlayCircle: {
      width: 82,
      height: 82,
      borderRadius: 41,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    videoStage: {
      marginTop: 6,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: '#0B1020',
      width: '100%',
      aspectRatio: 9 / 16,
    },
    video: {
      ...StyleSheet.absoluteFillObject,
    },
    pip: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 96,
      height: 132,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: '#0B1020',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.7)',
      zIndex: 3,
    },
    pipReel: {
      position: 'absolute',
      top: 16,
      right: 12,
      width: 118,
      height: 162,
      borderRadius: 14,
      overflow: 'hidden',
      backgroundColor: '#0B1020',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.75)',
      zIndex: 3,
    },
    timerBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 4,
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    timerText: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
      textAlign: 'center',
    },
  }));
}

function FeedPostVideoInner(props: {
  url: string;
  /**
   * Optional companion PIP clip URL for BeReal-style dual-camera posts.
   * When present we render it as a muted overlay in the top-right corner so
   * the viewer sees both cameras the same way they were recorded.
   */
  secondaryUrl?: string | null;
  /**
   * Dual-camera posts record audio on the back camera only. When the front camera
   * was the big view at capture time, audio lives on the PIP clip instead.
   */
  dualFrontIsPrimary?: boolean;
  shouldPlay: boolean;
  isMuted: boolean;
  useNativeControls: boolean;
  maxDurationSeconds: number;
  dataSaver: boolean;
  reel?: boolean;
  onReelActivate?: (videoId: string) => void;
  analyticsVideoId?: string;
  videoOwnerUid?: string;
  viewerUid?: string;
  viewerUsername?: string;
}) {
  const {
    url,
    secondaryUrl,
    dualFrontIsPrimary = false,
    shouldPlay,
    isMuted,
    useNativeControls,
    maxDurationSeconds,
    dataSaver,
    reel = false,
    onReelActivate,
    analyticsVideoId,
    videoOwnerUid,
    viewerUid,
    viewerUsername,
  } = props;
  const { colors } = useTheme();
  const styles = useFeedPostVideoStyles();
  const videoRef = React.useRef<Video>(null);
  const secondaryVideoRef = React.useRef<Video>(null);
  const secondarySyncPosRef = React.useRef(0);
  const [status, setStatus] = React.useState<AVPlaybackStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [playbackRetryKey, setPlaybackRetryKey] = React.useState(0);
  const playbackRetryCountRef = React.useRef(0);
  const lastStatusPaintRef = React.useRef(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const viewRecordedKeyRef = React.useRef<string | null>(null);
  const replayingRef = React.useRef(false);
  const [heartBurst, setHeartBurst] = React.useState<{ x: number; y: number } | null>(null);
  const heartScale = React.useRef(new Animated.Value(0)).current;
  const heartOpacity = React.useRef(new Animated.Value(0)).current;
  const heartAnimRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const prevEffectivePlayRef = React.useRef(false);

  React.useEffect(() => {
    viewRecordedKeyRef.current = null;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    setLoaded(false);
    playbackRetryCountRef.current = 0;
    lastStatusPaintRef.current = 0;
    prevEffectivePlayRef.current = false;
    secondarySyncPosRef.current = 0;
  }, [url, secondaryUrl]);

  React.useEffect(() => {
    if (!shouldPlay) setUserPaused(false);
  }, [shouldPlay]);

  React.useEffect(
    () => () => {
      heartAnimRef.current?.stop();
      void unloadVideoPlayer(videoRef.current);
      void unloadVideoPlayer(secondaryVideoRef.current);
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

  const effectivePlay = shouldPlay && !userPaused;
  const playerMuted = !effectivePlay || isMuted;
  const isDualPost = Boolean(secondaryUrl);
  const audioOnSecondary = isDualPost && dualFrontIsPrimary;
  const primaryAudioMuted = playerMuted || audioOnSecondary;
  const secondaryAudioMuted = playerMuted || !audioOnSecondary;

  // Native stop on deactivate — `shouldPlay` handles start/buffer; avoids pause loops.
  React.useEffect(() => {
    const player = videoRef.current;
    const secondary = secondaryVideoRef.current;
    const wasPlaying = prevEffectivePlayRef.current;
    prevEffectivePlayRef.current = effectivePlay;

    if (effectivePlay || !wasPlaying) return;

    void pauseVideoPlayer(player, reel);
    void pauseVideoPlayer(secondary, false);
  }, [effectivePlay, reel]);

  // expo-av does not always apply mute/volume prop changes while a clip is playing.
  React.useEffect(() => {
    const player = videoRef.current;
    if (!player) return;
    void (async () => {
      try {
        await player.setIsMutedAsync(primaryAudioMuted);
        await player.setVolumeAsync(audioOnSecondary ? 0 : playerMuted ? 0 : 1.0);
      } catch {
        // native race
      }
    })();
  }, [primaryAudioMuted, audioOnSecondary, playerMuted]);

  // Dual-camera PIP must follow the main reel on every play/replay/loop.
  React.useEffect(() => {
    if (!secondaryUrl) return;
    const secondary = secondaryVideoRef.current;
    if (!secondary) return;
    void (async () => {
      try {
        if (effectivePlay) {
          await secondary.setIsMutedAsync(secondaryAudioMuted);
          await secondary.setVolumeAsync(audioOnSecondary ? 1.0 : 0);
          await secondary.playAsync();
        } else {
          await secondary.pauseAsync();
        }
      } catch {
        // native race
      }
    })();
  }, [effectivePlay, secondaryUrl, secondaryAudioMuted, audioOnSecondary]);

  React.useEffect(() => {
    if (!secondaryUrl || !status?.isLoaded || !effectivePlay) return;
    const pos = status.positionMillis ?? 0;
    if (Math.abs(pos - secondarySyncPosRef.current) < 150) return;
    secondarySyncPosRef.current = pos;
    void secondaryVideoRef.current?.setPositionAsync(pos).catch(() => {});
  }, [secondaryUrl, status, effectivePlay]);

  const maybeRecordView = React.useCallback(() => {
    if (!analyticsVideoId || !viewerUid || !videoOwnerUid || viewerUid === videoOwnerUid) return;
    const key = `${analyticsVideoId}:${viewerUid}`;
    if (viewRecordedKeyRef.current === key) return;
    viewRecordedKeyRef.current = key;
    void recordVideoView(analyticsVideoId);
  }, [analyticsVideoId, viewerUid, videoOwnerUid]);

  const replayReel = React.useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    try {
      await videoRef.current?.replayAsync();
      if (secondaryUrl) await secondaryVideoRef.current?.replayAsync();
    } catch {
      // native race
    } finally {
      replayingRef.current = false;
    }
  }, [secondaryUrl]);

  const onPlaybackStatusUpdate = React.useCallback(
    (s: AVPlaybackStatus) => {
      if (s.isLoaded) setLoaded(true);

      if (!s.isLoaded) {
        setStatus(s);
        lastStatusPaintRef.current = 0;
        return;
      }

      if (effectivePlay && s.didJustFinish) {
        maybeRecordView();
        if (reel) void replayReel();
      } else if (effectivePlay) {
        const durMs = s.durationMillis ?? 0;
        const posMs = s.positionMillis ?? 0;
        // Long clips: count a view once the viewer is most of the way through.
        if (durMs >= 4000 && posMs >= durMs * 0.85) {
          maybeRecordView();
        }
      }

      const now = Date.now();
      const justLoaded = lastStatusPaintRef.current === 0;
      const posMs = s.positionMillis ?? 0;
      const durMs = s.durationMillis ?? 0;
      const nearEnd = durMs > 0 && durMs - posMs <= 1200;
      const paintInterval = nearEnd ? 200 : 750;
      if (justLoaded || now - lastStatusPaintRef.current >= paintInterval) {
        lastStatusPaintRef.current = now;
        setStatus(s);
      }
    },
    [effectivePlay, reel, maybeRecordView, replayReel]
  );

  const doSingleTap = React.useCallback(() => {
    if (!shouldPlay && onReelActivate && analyticsVideoId) {
      onReelActivate(analyticsVideoId);
      return;
    }
    // TikTok-style: single tap does not pause; only used to activate a non-playing reel.
  }, [shouldPlay, onReelActivate, analyticsVideoId]);

  const longPressActiveRef = React.useRef(false);
  const [longPressing, setLongPressing] = React.useState(false);
  const longPress = React.useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(220)
        .onStart(() => {
          longPressActiveRef.current = true;
          setLongPressing(true);
          setUserPaused(true);
        })
        .onEnd(() => {
          longPressActiveRef.current = false;
          setLongPressing(false);
          setUserPaused(false);
        })
        .onFinalize(() => {
          longPressActiveRef.current = false;
          setLongPressing(false);
          setUserPaused(false);
        }),
    []
  );

  const doDoubleTapLike = React.useCallback(
    (tapX: number, tapY: number) => {
      if (!reel) return;
      playHeartBurst(tapX, tapY);
      if (!analyticsVideoId || !viewerUid || !videoOwnerUid) return;
      void ensureVideoLiked({
        videoId: analyticsVideoId,
        viewerUid,
        viewerUsername: viewerUsername ?? 'user',
        videoOwnerUid,
      }).catch(() => {
        // ignore — heart animation already shown
      });
    },
    [reel, playHeartBurst, analyticsVideoId, viewerUid, viewerUsername, videoOwnerUid]
  );

  // Native gesture recognition (snappier than JS timers, feels closer to TikTok).
  const singleTap = React.useMemo(() => Gesture.Tap().numberOfTaps(1).onEnd(() => doSingleTap()), [doSingleTap]);
  const doubleTap = React.useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(280)
        .onEnd((e) => {
          doDoubleTapLike(e.x, e.y);
        }),
    [doDoubleTapLike]
  );
  const tapGesture = React.useMemo(() => Gesture.Exclusive(doubleTap, singleTap), [doubleTap, singleTap]);
  const reelGesture = React.useMemo(() => Gesture.Simultaneous(longPress, tapGesture), [longPress, tapGesture]);

  let remainingSec = maxDurationSeconds;
  if (status?.isLoaded) {
    const reportedMs = status.durationMillis ?? 0;
    const playableMs = status.playableDurationMillis ?? 0;
    const durMs =
      Math.max(reportedMs, playableMs) > 0
        ? Math.max(reportedMs, playableMs)
        : maxDurationSeconds * 1000;
    const posMs = status.positionMillis ?? 0;
    remainingSec = Math.max(0, Math.ceil((durMs - posMs) / 1000));
  }

  const nativeControls = reel ? false : useNativeControls;
  const resizeMode = reel ? ResizeMode.COVER : ResizeMode.CONTAIN;
  const videoStyle = reel ? StyleSheet.absoluteFillObject : styles.video;

  const reelTapLayer =
    reel ? (
      <GestureDetector gesture={reelGesture}>
        <View
          style={styles.reelTouchLayer}
          accessibilityRole="button"
          accessibilityLabel={userPaused ? 'Play video' : 'Pause video'}
        >
        {shouldPlay && longPressing ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <Ionicons name="pause" size={58} color="rgba(255,255,255,0.92)" />
          </View>
        ) : null}
        </View>
      </GestureDetector>
    ) : null;

  return (
    <View style={reel ? styles.videoStageReel : styles.videoStage}>
      <Video
        key={`${url}-${playbackRetryKey}`}
        ref={videoRef}
        source={{ uri: url }}
        style={videoStyle}
        resizeMode={resizeMode}
        shouldPlay={effectivePlay}
        isMuted={primaryAudioMuted}
        isLooping={false}
        volume={audioOnSecondary ? 0 : 1.0}
        useNativeControls={nativeControls}
        progressUpdateIntervalMillis={dataSaver ? 800 : 250}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={() => {
          if (playbackRetryCountRef.current < 2) {
            playbackRetryCountRef.current += 1;
            setLoaded(false);
            setUserPaused(false);
            setPlaybackRetryKey((k) => k + 1);
            return;
          }
          setLoaded(false);
          setUserPaused(false);
        }}
      />
      {reel && url && !loaded ? (
        <View style={styles.reelLoading} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
        </View>
      ) : null}
      {secondaryUrl ? (
        <View style={reel ? styles.pipReel : styles.pip} pointerEvents="none">
          <Video
            ref={secondaryVideoRef}
            source={{ uri: secondaryUrl }}
            style={StyleSheet.absoluteFillObject}
            resizeMode={ResizeMode.COVER}
            shouldPlay={effectivePlay}
            isMuted={secondaryAudioMuted}
            isLooping={false}
            volume={audioOnSecondary ? 1.0 : 0}
            progressUpdateIntervalMillis={dataSaver ? 1200 : 400}
          />
        </View>
      ) : null}
      {reelTapLayer}
      {reel && heartBurst ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.heartBurst,
            {
              left: heartBurst.x - HEART_BURST_SIZE / 2,
              top: heartBurst.y - HEART_BURST_SIZE / 2,
              opacity: heartOpacity,
              transform: [{ scale: heartScale }],
            },
          ]}
        >
          <Ionicons name="heart" size={HEART_BURST_SIZE} color={colors.coral} />
        </Animated.View>
      ) : null}
      <View style={styles.timerBar} pointerEvents="none">
        <Text style={styles.timerText}>{formatTimeLeft(remainingSec)} left</Text>
      </View>
    </View>
  );
}

/** Memoized so parent feed re-renders don’t recreate expo-av instances unless props meaningfully change. */
export const FeedPostVideo = React.memo(FeedPostVideoInner);

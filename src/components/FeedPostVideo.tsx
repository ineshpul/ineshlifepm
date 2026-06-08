import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '../theme/colors';
import { recordVideoView } from '../services/recordVideoView';
import { ensureVideoLiked } from '../services/videoLikes';

function formatTimeLeft(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/** Pause and mute a player when it leaves the active reel slot. */
async function stopVideoPlayer(player: Video | null, resetPosition: boolean) {
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
  onReelActivate?: () => void;
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
  const videoRef = React.useRef<Video>(null);
  const secondaryVideoRef = React.useRef<Video>(null);
  const [status, setStatus] = React.useState<AVPlaybackStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const lastStatusPaintRef = React.useRef(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const viewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRecordedKeyRef = React.useRef<string | null>(null);
  const [likeFlash, setLikeFlash] = React.useState(false);
  const likeFlashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevEffectivePlayRef = React.useRef(false);

  React.useEffect(() => {
    viewRecordedKeyRef.current = null;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    setLoaded(false);
    lastStatusPaintRef.current = 0;
    prevEffectivePlayRef.current = false;
  }, [url]);

  React.useEffect(() => {
    if (!shouldPlay) setUserPaused(false);
  }, [shouldPlay]);

  React.useEffect(
    () => () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      if (likeFlashTimerRef.current) clearTimeout(likeFlashTimerRef.current);
      void stopVideoPlayer(videoRef.current, false);
      void stopVideoPlayer(secondaryVideoRef.current, false);
    },
    []
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

    void stopVideoPlayer(player, reel);
    void stopVideoPlayer(secondary, false);
  }, [effectivePlay, reel]);

  // Dual-camera PIP can keep playing when it carries audio — force it to follow the main reel.
  React.useEffect(() => {
    if (!secondaryUrl) return;
    const secondary = secondaryVideoRef.current;
    if (!secondary) return;
    void (async () => {
      try {
        if (effectivePlay) {
          await secondary.playAsync();
        } else {
          await secondary.pauseAsync();
        }
      } catch {
        // native race
      }
    })();
  }, [effectivePlay, secondaryUrl]);

  React.useEffect(() => {
    if (viewTimerRef.current) {
      clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    }
    if (!effectivePlay || !analyticsVideoId || !viewerUid || !videoOwnerUid || viewerUid === videoOwnerUid) {
      return;
    }
    const key = `${analyticsVideoId}:${viewerUid}`;
    if (viewRecordedKeyRef.current === key) return;
    viewTimerRef.current = setTimeout(() => {
      viewTimerRef.current = null;
      viewRecordedKeyRef.current = key;
      void recordVideoView(analyticsVideoId);
    }, 2500);
    return () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      viewTimerRef.current = null;
    };
  }, [effectivePlay, analyticsVideoId, viewerUid, videoOwnerUid]);

  const onPlaybackStatusUpdate = React.useCallback((s: AVPlaybackStatus) => {
    if (s.isLoaded) setLoaded(true);

    if (!s.isLoaded) {
      setStatus(s);
      lastStatusPaintRef.current = 0;
      return;
    }
    const now = Date.now();
    const justLoaded = lastStatusPaintRef.current === 0;
    if (justLoaded || now - lastStatusPaintRef.current >= 750) {
      lastStatusPaintRef.current = now;
      setStatus(s);
    }
  }, []);

  const doSingleTap = React.useCallback(() => {
    if (!shouldPlay && onReelActivate) {
      onReelActivate();
      return;
    }
    // TikTok-style: single tap does not pause; only used to activate a non-playing reel.
  }, [shouldPlay, onReelActivate]);

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

  const doDoubleTapLike = React.useCallback(() => {
    if (!analyticsVideoId || !viewerUid || !viewerUsername || !videoOwnerUid) return;
    void (async () => {
      try {
        const didLike = await ensureVideoLiked({
          videoId: analyticsVideoId,
          viewerUid,
          viewerUsername,
          videoOwnerUid,
        });
        if (didLike) {
          setLikeFlash(true);
          if (likeFlashTimerRef.current) clearTimeout(likeFlashTimerRef.current);
          likeFlashTimerRef.current = setTimeout(() => {
            likeFlashTimerRef.current = null;
            setLikeFlash(false);
          }, 450);
        }
      } catch {
        // ignore
      }
    })();
  }, [analyticsVideoId, viewerUid, viewerUsername, videoOwnerUid]);

  // Native gesture recognition (snappier than JS timers, feels closer to TikTok).
  const singleTap = React.useMemo(() => Gesture.Tap().numberOfTaps(1).onEnd(() => doSingleTap()), [doSingleTap]);
  const doubleTap = React.useMemo(
    () => Gesture.Tap().numberOfTaps(2).maxDelay(190).onEnd(() => doDoubleTapLike()),
    [doDoubleTapLike]
  );
  const tapGesture = React.useMemo(() => Gesture.Exclusive(doubleTap, singleTap), [doubleTap, singleTap]);
  const reelGesture = React.useMemo(() => Gesture.Simultaneous(longPress, tapGesture), [longPress, tapGesture]);

  let remainingSec = maxDurationSeconds;
  if (status?.isLoaded) {
    const durMs =
      status.durationMillis && status.durationMillis > 0
        ? status.durationMillis
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
        ref={videoRef}
        source={{ uri: url }}
        style={videoStyle}
        resizeMode={resizeMode}
        shouldPlay={effectivePlay}
        isMuted={primaryAudioMuted}
        isLooping={reel}
        volume={audioOnSecondary ? 0 : 1.0}
        useNativeControls={nativeControls}
        progressUpdateIntervalMillis={dataSaver ? 1200 : 600}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={() => {
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
            isLooping={reel}
            volume={audioOnSecondary ? 1.0 : 0}
            progressUpdateIntervalMillis={dataSaver ? 2000 : 1000}
          />
        </View>
      ) : null}
      {reelTapLayer}
      {reel && likeFlash ? (
        <View style={styles.likeFlash} pointerEvents="none">
          <Ionicons name="heart" size={92} color="rgba(255,255,255,0.92)" />
        </View>
      ) : null}
      <View style={styles.timerBar} pointerEvents="none">
        <Text style={styles.timerText}>{formatTimeLeft(remainingSec)} left</Text>
      </View>
    </View>
  );
}

/** Memoized so parent feed re-renders don’t recreate expo-av instances unless props meaningfully change. */
export const FeedPostVideo = React.memo(FeedPostVideoInner);

const styles = StyleSheet.create({
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
  likeFlash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
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
  // PIP overlays for BeReal-style dual posts. The reel variant sits just above
  // the timer bar so it doesn't get clipped by the safe-area; the inline
  // (non-reel) variant uses a slightly smaller tile to match the boxed layout.
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
});

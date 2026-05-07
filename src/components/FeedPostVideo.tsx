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

function FeedPostVideoInner(props: {
  url: string;
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
  const [status, setStatus] = React.useState<AVPlaybackStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const lastStatusPaintRef = React.useRef(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const viewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRecordedKeyRef = React.useRef<string | null>(null);
  const [likeFlash, setLikeFlash] = React.useState(false);
  const likeFlashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    viewRecordedKeyRef.current = null;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    setLoaded(false);
    lastStatusPaintRef.current = 0;
  }, [url]);

  React.useEffect(() => {
    if (!shouldPlay) setUserPaused(false);
  }, [shouldPlay]);

  React.useEffect(
    () => () => {
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
      if (likeFlashTimerRef.current) clearTimeout(likeFlashTimerRef.current);
    },
    []
  );

  const effectivePlay = shouldPlay && !userPaused;
  const prevShouldPlayRef = React.useRef(shouldPlay);

  // Required: when a reel leaves the active viewport, reset it to the beginning.
  React.useEffect(() => {
    if (!reel) {
      prevShouldPlayRef.current = shouldPlay;
      return;
    }
    const prev = prevShouldPlayRef.current;
    prevShouldPlayRef.current = shouldPlay;
    if (prev && !shouldPlay) {
      const player = videoRef.current;
      if (!player) return;
      void (async () => {
        try {
          await player.pauseAsync();
          await player.setPositionAsync(0);
        } catch {
          // best-effort
        }
      })();
    }
  }, [reel, shouldPlay, url]);

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

  React.useEffect(() => {
    const player = videoRef.current;
    if (!player) return;
    if (effectivePlay && loaded) {
      void (async () => {
        try {
          await player.setIsMutedAsync(false);
          await player.setVolumeAsync(1.0);
          await player.playAsync();
        } catch {
          /* native race */
        }
      })();
    } else if (!effectivePlay) {
      void player.pauseAsync?.();
    }
  }, [effectivePlay, loaded, url]);

  const onPlaybackStatusUpdate = React.useCallback((s: AVPlaybackStatus) => {
    if (s.isLoaded) setLoaded(true);
    else setLoaded(false);

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
    reel && (shouldPlay || onReelActivate) ? (
      <GestureDetector gesture={reelGesture}>
        <View
          style={styles.reelTouchLayer}
          accessibilityRole="button"
          accessibilityLabel={
            !shouldPlay && onReelActivate ? 'Play video' : userPaused ? 'Play video' : 'Pause video'
          }
        >
        {shouldPlay && longPressing ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <Ionicons name="pause" size={58} color="rgba(255,255,255,0.92)" />
          </View>
        ) : !shouldPlay && onReelActivate ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <View style={styles.reelPlayCircle}>
              <Ionicons name="play" size={42} color="rgba(255,255,255,0.96)" style={{ marginLeft: 4 }} />
            </View>
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
        isMuted={isMuted}
        isLooping={reel}
        volume={1.0}
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

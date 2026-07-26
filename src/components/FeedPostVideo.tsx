import * as React from 'react';
import { ActivityIndicator, Animated, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { DualClipPlayback, type DualClipPlaybackStatus } from './DualClipPlayback';
import { ReelSinglePlayback, type ReelSinglePlaybackStatus } from './ReelSinglePlayback';
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

/** Empty reel slot — same footprint as the player, without holding a native decoder. */
export function ReelVideoPlaceholder({ posterUrl }: { posterUrl?: string | null }) {
  const styles = useFeedPostVideoStyles();
  const uri = String(posterUrl ?? '').trim();
  return (
    <View style={styles.videoStageReel}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
      ) : null}
    </View>
  );
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
  /** Proof / camera-roll leaps may be still photos. */
  mediaType?: 'video' | 'photo';
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
  /** First-frame JPEG shown under the player until the decoder paints. */
  posterUrl?: string | null;
  /** Fires once the active reel is ready to paint/play. */
  onReady?: (videoId: string) => void;
}) {
  const {
    url,
    secondaryUrl,
    dualFrontIsPrimary = false,
    mediaType = 'video',
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
    posterUrl,
    onReady,
  } = props;
  const { colors } = useTheme();
  const styles = useFeedPostVideoStyles();
  const [singleStatus, setSingleStatus] = React.useState<ReelSinglePlaybackStatus | null>(null);
  const [dualStatus, setDualStatus] = React.useState<DualClipPlaybackStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const lastStatusPaintRef = React.useRef(0);
  const [userPaused, setUserPaused] = React.useState(false);
  const viewRecordedKeyRef = React.useRef<string | null>(null);
  const readyNotifiedRef = React.useRef(false);
  const onReadyRef = React.useRef(onReady);
  onReadyRef.current = onReady;
  const [heartBurst, setHeartBurst] = React.useState<{ x: number; y: number } | null>(null);
  const heartScale = React.useRef(new Animated.Value(0)).current;
  const heartOpacity = React.useRef(new Animated.Value(0)).current;
  const heartAnimRef = React.useRef<Animated.CompositeAnimation | null>(null);

  React.useEffect(() => {
    viewRecordedKeyRef.current = null;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    setLoaded(false);
    lastStatusPaintRef.current = 0;
    setDualStatus(null);
    setSingleStatus(null);
    readyNotifiedRef.current = false;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    if (!shouldPlay || !loaded || readyNotifiedRef.current) return;
    if (!analyticsVideoId) return;
    readyNotifiedRef.current = true;
    onReadyRef.current?.(analyticsVideoId);
  }, [shouldPlay, loaded, analyticsVideoId]);

  React.useEffect(() => {
    if (!shouldPlay) setUserPaused(false);
  }, [shouldPlay]);

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

  const effectivePlay = shouldPlay && !userPaused;
  const isLocalPlayback = /^file:\/\//i.test(url);
  const playerMuted = !effectivePlay || isMuted;
  const isDualPost = Boolean(secondaryUrl);

  const maybeRecordView = React.useCallback(() => {
    if (!analyticsVideoId || !viewerUid || !videoOwnerUid || viewerUid === videoOwnerUid) return;
    const key = `${analyticsVideoId}:${viewerUid}`;
    if (viewRecordedKeyRef.current === key) return;
    viewRecordedKeyRef.current = key;
    void recordVideoView(analyticsVideoId);
  }, [analyticsVideoId, viewerUid, videoOwnerUid]);

  const onClipStatus = React.useCallback(
    (s: DualClipPlaybackStatus | ReelSinglePlaybackStatus, kind: 'dual' | 'single') => {
      if (s.isLoaded) setLoaded(true);

      if (effectivePlay && s.didJustFinish) {
        maybeRecordView();
      } else if (effectivePlay) {
        const durMs = s.durationMillis ?? 0;
        const posMs = s.positionMillis ?? 0;
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
        if (kind === 'dual') setDualStatus(s);
        else setSingleStatus(s);
      }
    },
    [effectivePlay, maybeRecordView]
  );

  const onDualPlaybackStatus = React.useCallback(
    (s: DualClipPlaybackStatus) => onClipStatus(s, 'dual'),
    [onClipStatus]
  );

  const onSinglePlaybackStatus = React.useCallback(
    (s: ReelSinglePlaybackStatus) => onClipStatus(s, 'single'),
    [onClipStatus]
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

  React.useEffect(() => {
    if (mediaType !== 'photo' || !shouldPlay) return;
    setLoaded(true);
    maybeRecordView();
  }, [mediaType, shouldPlay, maybeRecordView, url]);

  if (mediaType === 'photo') {
    const photoStyle = reel ? StyleSheet.absoluteFillObject : styles.video;
    const photoTapLayer =
      reel ? (
        <GestureDetector gesture={reelGesture}>
          <View
            style={styles.reelTouchLayer}
            accessibilityRole="button"
            accessibilityLabel="Photo leap"
          />
        </GestureDetector>
      ) : null;
    return (
      <View style={reel ? styles.videoStageReel : styles.videoStage}>
        <Image
          source={{ uri: url }}
          style={photoStyle}
          resizeMode={reel ? 'cover' : 'contain'}
          onLoad={() => setLoaded(true)}
        />
        {reel && url && !loaded ? (
          <View style={styles.reelLoading} pointerEvents="none">
            <ActivityIndicator size="large" color={colors.white} />
          </View>
        ) : null}
        {photoTapLayer}
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
      </View>
    );
  }

  let remainingSec = maxDurationSeconds;
  const liveStatus = isDualPost ? dualStatus : singleStatus;
  if (liveStatus?.isLoaded) {
    const durMs = liveStatus.durationMillis > 0 ? liveStatus.durationMillis : maxDurationSeconds * 1000;
    const posMs = liveStatus.positionMillis ?? 0;
    remainingSec = Math.max(0, Math.ceil((durMs - posMs) / 1000));
  }

  const nativeControls = reel ? false : useNativeControls;
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

  const posterUri = String(posterUrl ?? '').trim();

  return (
    <View style={reel ? styles.videoStageReel : styles.videoStage}>
      {reel && posterUri && !loaded ? (
        <Image
          source={{ uri: posterUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        />
      ) : null}
      {isDualPost && secondaryUrl ? (
        <DualClipPlayback
          primaryUrl={url}
          secondaryUrl={secondaryUrl}
          dualFrontIsPrimary={dualFrontIsPrimary}
          shouldPlay={effectivePlay}
          isMuted={playerMuted}
          nativeControls={nativeControls}
          primaryContentFit={reel ? 'cover' : 'contain'}
          primaryStyle={videoStyle}
          pipStyle={reel ? styles.pipReel : styles.pip}
          syncIntervalMs={dataSaver ? 500 : 350}
          replayOnEnd={reel && effectivePlay}
          onPlaybackStatus={onDualPlaybackStatus}
        />
      ) : (
        <ReelSinglePlayback
          url={url}
          shouldPlay={effectivePlay}
          isMuted={playerMuted}
          nativeControls={nativeControls}
          contentFit={reel ? 'cover' : 'contain'}
          style={videoStyle}
          dataSaver={dataSaver}
          replayOnEnd={reel && effectivePlay}
          onPlaybackStatus={onSinglePlaybackStatus}
        />
      )}
      {reel && effectivePlay && url && !loaded && !isLocalPlayback && !posterUri ? (
        <View style={styles.reelLoading} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.white} />
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

/** Memoized so parent feed re-renders don’t recreate players unless props meaningfully change. */
export const FeedPostVideo = React.memo(FeedPostVideoInner);

import * as React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';

import { colors } from '../theme/colors';
import { recordVideoView } from '../services/recordVideoView';

function formatTimeLeft(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function FeedPostVideo(props: {
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
  } = props;
  const videoRef = React.useRef<Video>(null);
  const [status, setStatus] = React.useState<AVPlaybackStatus | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  const [pauseFlash, setPauseFlash] = React.useState(false);
  const pauseFlashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewRecordedKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    viewRecordedKeyRef.current = null;
  }, [analyticsVideoId]);

  React.useEffect(() => {
    setLoaded(false);
  }, [url]);

  React.useEffect(() => {
    if (!shouldPlay) setUserPaused(false);
  }, [shouldPlay]);

  React.useEffect(
    () => () => {
      if (pauseFlashTimerRef.current) clearTimeout(pauseFlashTimerRef.current);
      if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    },
    []
  );

  const effectivePlay = shouldPlay && !userPaused;

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

  const onPlaybackStatusUpdate = (s: AVPlaybackStatus) => {
    setStatus(s);
    if (s.isLoaded) setLoaded(true);
  };

  const onReelTap = React.useCallback(() => {
    if (!shouldPlay && onReelActivate) {
      onReelActivate();
      setUserPaused(false);
      return;
    }
    if (!shouldPlay) return;
    if (userPaused) {
      setUserPaused(false);
      return;
    }
    setUserPaused(true);
    setPauseFlash(true);
    if (pauseFlashTimerRef.current) clearTimeout(pauseFlashTimerRef.current);
    pauseFlashTimerRef.current = setTimeout(() => {
      pauseFlashTimerRef.current = null;
      setPauseFlash(false);
    }, 550);
  }, [shouldPlay, userPaused, onReelActivate]);

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
      <Pressable
        style={styles.reelTouchLayer}
        onPress={onReelTap}
        accessibilityRole="button"
        accessibilityLabel={
          !shouldPlay && onReelActivate ? 'Play video' : userPaused ? 'Play video' : 'Pause video'
        }
      >
        {pauseFlash ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <Ionicons name="pause" size={58} color="rgba(255,255,255,0.92)" />
          </View>
        ) : shouldPlay && userPaused ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <View style={styles.reelPlayCircle}>
              <Ionicons name="play" size={42} color="rgba(255,255,255,0.96)" style={{ marginLeft: 4 }} />
            </View>
          </View>
        ) : !shouldPlay && onReelActivate ? (
          <View style={styles.reelIconCenter} pointerEvents="none">
            <View style={styles.reelPlayCircle}>
              <Ionicons name="play" size={42} color="rgba(255,255,255,0.96)" style={{ marginLeft: 4 }} />
            </View>
          </View>
        ) : null}
      </Pressable>
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
        progressUpdateIntervalMillis={dataSaver ? 1000 : 250}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={() => {
          setLoaded(false);
          setUserPaused(false);
        }}
      />
      {reelTapLayer}
      <View style={styles.timerBar} pointerEvents="none">
        <Text style={styles.timerText}>{formatTimeLeft(remainingSec)} left</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  videoStageReel: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#0B1020',
  },
  reelTouchLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
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

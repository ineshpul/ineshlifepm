import * as React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';

export type DualClipPlaybackStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  didJustFinish: boolean;
};

type Props = {
  primaryUrl: string;
  secondaryUrl: string;
  /** When true, audio was captured on the PIP (secondary) clip. */
  dualFrontIsPrimary?: boolean;
  shouldPlay: boolean;
  isMuted: boolean;
  nativeControls?: boolean;
  primaryContentFit?: VideoContentFit;
  primaryStyle?: ViewStyle;
  pipStyle?: ViewStyle;
  /** How often to re-align the PIP to the primary clock (ms). */
  syncIntervalMs?: number;
  /** When true, both clips restart from zero after the primary reaches the end. */
  replayOnEnd?: boolean;
  onPlaybackStatus?: (status: DualClipPlaybackStatus) => void;
};

const DEFAULT_PIP: ViewStyle = {
  position: 'absolute',
  top: 12,
  right: 12,
  width: 110,
  height: 150,
  borderRadius: 14,
  overflow: 'hidden',
  backgroundColor: '#0F172A',
  borderWidth: 2,
  borderColor: 'rgba(255,255,255,0.7)',
};

/**
 * Frame-locked dual-camera playback via expo-video. Both decoders share one
 * timeline so the selfie PIP stays glued to the main clip during preview,
 * feed reels, and post detail.
 */
export function DualClipPlayback({
  primaryUrl,
  secondaryUrl,
  dualFrontIsPrimary = false,
  shouldPlay,
  isMuted,
  nativeControls = false,
  primaryContentFit = 'contain',
  primaryStyle,
  pipStyle,
  syncIntervalMs = 100,
  replayOnEnd = false,
  onPlaybackStatus,
}: Props) {
  const audioOnSecondary = dualFrontIsPrimary;
  const primaryMuted = isMuted || audioOnSecondary;
  const secondaryMuted = isMuted || !audioOnSecondary;

  const onStatusRef = React.useRef(onPlaybackStatus);
  onStatusRef.current = onPlaybackStatus;

  const primaryPlayer = useVideoPlayer({ uri: primaryUrl }, (p) => {
    p.loop = false;
    p.muted = primaryMuted;
    p.volume = primaryMuted ? 0 : 1;
    p.timeUpdateEventInterval = Math.max(0.05, syncIntervalMs / 1000);
  });
  const secondaryPlayer = useVideoPlayer({ uri: secondaryUrl }, (p) => {
    p.loop = false;
    p.muted = secondaryMuted;
    p.volume = secondaryMuted ? 0 : 1;
  });

  React.useEffect(() => {
    try {
      primaryPlayer.muted = primaryMuted;
      primaryPlayer.volume = primaryMuted ? 0 : 1;
    } catch {
      // ignore
    }
  }, [primaryPlayer, primaryMuted]);

  React.useEffect(() => {
    try {
      secondaryPlayer.muted = secondaryMuted;
      secondaryPlayer.volume = secondaryMuted ? 0 : 1;
    } catch {
      // ignore
    }
  }, [secondaryPlayer, secondaryMuted]);

  const emitStatus = React.useCallback(
    (didJustFinish = false) => {
      try {
        const durationSec = primaryPlayer.duration ?? 0;
        const positionSec = primaryPlayer.currentTime ?? 0;
        onStatusRef.current?.({
          isLoaded: durationSec > 0 || positionSec > 0,
          isPlaying: primaryPlayer.playing,
          positionMillis: Math.round(positionSec * 1000),
          durationMillis: Math.round(durationSec * 1000),
          didJustFinish,
        });
      } catch {
        // ignore
      }
    },
    [primaryPlayer]
  );

  const syncPipToPrimary = React.useCallback(() => {
    try {
      const primaryTime = primaryPlayer.currentTime ?? 0;
      const primaryPlaying = primaryPlayer.playing;
      if (primaryPlaying) {
        if (Math.abs((secondaryPlayer.currentTime ?? 0) - primaryTime) > 0.08) {
          secondaryPlayer.currentTime = primaryTime;
        }
        if (!secondaryPlayer.playing) {
          secondaryPlayer.play();
        }
      } else if (secondaryPlayer.playing) {
        secondaryPlayer.pause();
      }
    } catch {
      // ignore
    }
  }, [primaryPlayer, secondaryPlayer]);

  React.useEffect(() => {
    const playSub = primaryPlayer.addListener('playingChange', () => {
      syncPipToPrimary();
      emitStatus();
    });
    const timeSub = primaryPlayer.addListener('timeUpdate', () => {
      syncPipToPrimary();
      emitStatus();
    });
    const endSub = primaryPlayer.addListener('playToEnd', () => {
      try {
        if (replayOnEnd && shouldPlay) {
          primaryPlayer.currentTime = 0;
          secondaryPlayer.currentTime = 0;
          primaryPlayer.play();
          secondaryPlayer.play();
        } else {
          secondaryPlayer.pause();
          secondaryPlayer.currentTime = 0;
        }
      } catch {
        // ignore
      }
      emitStatus(true);
    });
    const interval = setInterval(() => {
      syncPipToPrimary();
      emitStatus();
    }, syncIntervalMs);

    return () => {
      playSub.remove();
      timeSub.remove();
      endSub.remove();
      clearInterval(interval);
    };
  }, [
    primaryPlayer,
    secondaryPlayer,
    syncIntervalMs,
    replayOnEnd,
    shouldPlay,
    syncPipToPrimary,
    emitStatus,
  ]);

  React.useEffect(() => {
    try {
      if (shouldPlay) {
        primaryPlayer.play();
        syncPipToPrimary();
      } else {
        primaryPlayer.pause();
        secondaryPlayer.pause();
      }
    } catch {
      // ignore
    }
  }, [shouldPlay, primaryPlayer, secondaryPlayer, syncPipToPrimary]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        style={primaryStyle ?? StyleSheet.absoluteFillObject}
        player={primaryPlayer}
        nativeControls={nativeControls}
        contentFit={primaryContentFit}
        allowsFullscreen={nativeControls}
      />
      <View style={pipStyle ?? DEFAULT_PIP} pointerEvents="none">
        <VideoView
          style={StyleSheet.absoluteFillObject}
          player={secondaryPlayer}
          nativeControls={false}
          contentFit="cover"
        />
      </View>
    </View>
  );
}

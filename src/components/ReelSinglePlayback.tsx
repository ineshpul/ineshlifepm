import * as React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';

export type ReelSinglePlaybackStatus = {
  isLoaded: boolean;
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  didJustFinish: boolean;
};

type Props = {
  url: string;
  shouldPlay: boolean;
  isMuted: boolean;
  nativeControls?: boolean;
  contentFit?: VideoContentFit;
  style?: ViewStyle;
  dataSaver?: boolean;
  replayOnEnd?: boolean;
  onPlaybackStatus?: (status: ReelSinglePlaybackStatus) => void;
};

/**
 * Single-clip player tuned for Firebase progressive MP4s.
 *
 * `waitsToMinimizeStalling: false` is required — with it true, AVPlayer can sit
 * on the first frame for 10–30s waiting for a huge buffer of a phone-camera file.
 */
export function ReelSinglePlayback({
  url,
  shouldPlay,
  isMuted,
  nativeControls = false,
  contentFit = 'cover',
  style,
  dataSaver = false,
  replayOnEnd = false,
  onPlaybackStatus,
}: Props) {
  const onStatusRef = React.useRef(onPlaybackStatus);
  onStatusRef.current = onPlaybackStatus;
  const shouldPlayRef = React.useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;
  const readyRef = React.useRef(false);

  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.muted = true;
    p.volume = 0;
    p.timeUpdateEventInterval = dataSaver ? 0.75 : 0.4;
    p.bufferOptions = {
      // Tiny slice — start ASAP on progressive MP4; grow while playing.
      preferredForwardBufferDuration: dataSaver ? 1 : 2,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.3,
    };
  });

  const emitStatus = React.useCallback(
    (didJustFinish = false) => {
      try {
        const durationSec = player.duration ?? 0;
        const positionSec = player.currentTime ?? 0;
        const ready =
          readyRef.current ||
          player.status === 'readyToPlay' ||
          durationSec > 0 ||
          positionSec > 0 ||
          player.playing;
        onStatusRef.current?.({
          isLoaded: ready,
          isPlaying: player.playing,
          positionMillis: Math.round(positionSec * 1000),
          durationMillis: Math.round(durationSec * 1000),
          didJustFinish,
        });
      } catch {
        // ignore
      }
    },
    [player]
  );

  const startIfNeeded = React.useCallback(() => {
    if (!shouldPlayRef.current) return;
    try {
      const muted = false; // caller passes isMuted via effect; start unmuted path below
      void muted;
      player.play();
      emitStatus();
    } catch {
      // ignore
    }
  }, [player, emitStatus]);

  React.useEffect(() => {
    try {
      const muted = isMuted || !shouldPlay;
      player.muted = muted;
      player.volume = muted ? 0 : 1;
      if (shouldPlay) {
        if (readyRef.current || player.status === 'readyToPlay') {
          player.play();
        }
        // else: statusChange → readyToPlay will start
      } else {
        player.pause();
      }
      emitStatus();
    } catch {
      // ignore
    }
  }, [shouldPlay, isMuted, player, emitStatus]);

  React.useEffect(() => {
    const statusSub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        readyRef.current = true;
        emitStatus();
        if (shouldPlayRef.current) {
          try {
            player.play();
          } catch {
            // ignore
          }
        }
      } else {
        emitStatus();
      }
    });
    const playSub = player.addListener('playingChange', () => emitStatus());
    const timeSub = player.addListener('timeUpdate', () => {
      if (!shouldPlayRef.current) return;
      emitStatus();
    });
    const endSub = player.addListener('playToEnd', () => {
      try {
        if (replayOnEnd && shouldPlayRef.current) {
          player.currentTime = 0;
          player.play();
        }
      } catch {
        // ignore
      }
      emitStatus(true);
    });

    if (player.status === 'readyToPlay') {
      readyRef.current = true;
      startIfNeeded();
    }
    emitStatus();

    return () => {
      statusSub.remove();
      playSub.remove();
      timeSub.remove();
      endSub.remove();
    };
  }, [player, replayOnEnd, emitStatus, startIfNeeded]);

  return (
    <View style={style ?? StyleSheet.absoluteFillObject}>
      <VideoView
        style={StyleSheet.absoluteFillObject}
        player={player}
        nativeControls={nativeControls}
        contentFit={contentFit}
        allowsFullscreen={nativeControls}
      />
    </View>
  );
}

import * as React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';

import { enterPlayback } from '../camera/audioSessionGate';

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
  const retriedRef = React.useRef(false);

  // `readyRef` would otherwise stay true from the previous clip when a recycled
  // row swaps its url, making the next source look ready before it is.
  React.useEffect(() => {
    readyRef.current = false;
    retriedRef.current = false;
  }, [url]);

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
      player.play();
      emitStatus();
    } catch {
      // ignore
    }
  }, [player, emitStatus]);

  React.useEffect(() => {
    let cancelled = false;
    try {
      const muted = isMuted || !shouldPlay;
      player.muted = muted;
      player.volume = muted ? 0 : 1;
      if (shouldPlay) {
        /**
         * Restore the playback audio category before this clip takes over. A capture
         * surface (Record, Best Part, intro leap) leaves the session in record mode,
         * and the Feed's `patchAudioMode` deliberately refuses to clear
         * `allowsRecordingIOS` — so nothing else flips it back for a single-clip post.
         * DualClipPlayback already did this, which is why only *some* feed videos
         * stalled or played silent. Scoped to the clip becoming active so we don't
         * serialize every mounted player behind a setAudioModeAsync call.
         * No-ops while a capture surface still holds the record category.
         */
        void enterPlayback()
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled) startIfNeeded();
          });
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
    return () => {
      cancelled = true;
    };
  }, [shouldPlay, isMuted, player, emitStatus, startIfNeeded]);

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
        return;
      }
      /**
       * A failed item never recovers on its own — AVKit paints its crossed-out
       * play placeholder over the poster and the row stays stuck. Reload the
       * source once before giving up.
       */
      if (status === 'error' && !retriedRef.current) {
        retriedRef.current = true;
        readyRef.current = false;
        void player
          .replaceAsync(url)
          .then(() => {
            if (!shouldPlayRef.current) return;
            try {
              player.play();
            } catch {
              // ignore
            }
          })
          .catch(() => undefined);
      }
      emitStatus();
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
  }, [player, url, replayOnEnd, emitStatus, startIfNeeded]);

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

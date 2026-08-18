import * as React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useVideoPlayer, VideoView, type VideoContentFit } from 'expo-video';

import { enterPlayback } from '../camera/audioSessionGate';

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
  /**
   * When true, the front camera was full-screen at capture. Audio still lives on
   * the back-camera file (secondaryUrl after capture remap).
   */
  dualFrontIsPrimary?: boolean;
  shouldPlay: boolean;
  isMuted: boolean;
  nativeControls?: boolean;
  primaryContentFit?: VideoContentFit;
  primaryStyle?: ViewStyle;
  pipStyle?: ViewStyle;
  syncIntervalMs?: number;
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
 * Dual-camera feed playback.
 * Critical: waitsToMinimizeStalling MUST be false for progressive Storage MP4s —
 * otherwise iOS can hold for tens of seconds before the first audible frame.
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
  syncIntervalMs = 350,
  replayOnEnd = false,
  onPlaybackStatus,
}: Props) {
  const audioUrl = dualFrontIsPrimary ? secondaryUrl : primaryUrl;
  const silentUrl = dualFrontIsPrimary ? primaryUrl : secondaryUrl;

  const onStatusRef = React.useRef(onPlaybackStatus);
  onStatusRef.current = onPlaybackStatus;
  const shouldPlayRef = React.useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;
  const readyRef = React.useRef(false);
  /** Bumps when a new play kick is scheduled so stale delayed kicks no-op. */
  const kickGenRef = React.useRef(0);

  const audioPlayer = useVideoPlayer(audioUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.volume = 0;
    p.timeUpdateEventInterval = 0.5;
    p.bufferOptions = {
      preferredForwardBufferDuration: 2.5,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.5,
    };
  });
  const silentPlayer = useVideoPlayer(silentUrl, (p) => {
    p.loop = false;
    p.muted = true;
    p.volume = 0;
    p.timeUpdateEventInterval = 0;
    p.bufferOptions = {
      preferredForwardBufferDuration: 2.5,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 0.5,
    };
  });

  const timelinePlayer = dualFrontIsPrimary ? silentPlayer : audioPlayer;
  const followPlayer = dualFrontIsPrimary ? audioPlayer : silentPlayer;

  const emitStatus = React.useCallback(
    (didJustFinish = false) => {
      try {
        const durationSec = timelinePlayer.duration ?? 0;
        const positionSec = timelinePlayer.currentTime ?? 0;
        const ready =
          readyRef.current ||
          timelinePlayer.status === 'readyToPlay' ||
          durationSec > 0 ||
          positionSec > 0;
        onStatusRef.current?.({
          isLoaded: ready,
          isPlaying: timelinePlayer.playing,
          positionMillis: Math.round(positionSec * 1000),
          durationMillis: Math.round(durationSec * 1000),
          didJustFinish,
        });
      } catch {
        // ignore
      }
    },
    [timelinePlayer]
  );

  const applyMute = React.useCallback(() => {
    try {
      const muted = isMuted || !shouldPlayRef.current;
      audioPlayer.muted = muted;
      audioPlayer.volume = muted ? 0 : 1;
      silentPlayer.muted = true;
      silentPlayer.volume = 0;
    } catch {
      // ignore
    }
  }, [audioPlayer, silentPlayer, isMuted]);

  const syncFollow = React.useCallback(() => {
    if (!shouldPlayRef.current) return;
    try {
      const t = timelinePlayer.currentTime ?? 0;
      if (Math.abs((followPlayer.currentTime ?? 0) - t) > 0.2) {
        followPlayer.currentTime = t;
      }
      if (timelinePlayer.playing && !followPlayer.playing) followPlayer.play();
      if (!timelinePlayer.playing && followPlayer.playing) followPlayer.pause();
    } catch {
      // ignore
    }
  }, [timelinePlayer, followPlayer]);

  const startIfNeeded = React.useCallback(() => {
    if (!shouldPlayRef.current) return;
    const kickId = ++kickGenRef.current;
    const kick = () => {
      if (kickId !== kickGenRef.current || !shouldPlayRef.current) return;
      try {
        applyMute();
        timelinePlayer.play();
        requestAnimationFrame(() => {
          if (kickId !== kickGenRef.current || !shouldPlayRef.current) return;
          try {
            followPlayer.play();
            syncFollow();
          } catch {
            // ignore
          }
        });
        emitStatus();
      } catch {
        // ignore
      }
    };
    void enterPlayback()
      .catch(() => undefined)
      .finally(() => {
        if (kickId !== kickGenRef.current) return;
        setTimeout(kick, 220);
      });
  }, [timelinePlayer, followPlayer, applyMute, syncFollow, emitStatus]);

  React.useEffect(() => {
    applyMute();
    if (shouldPlay) {
      // If already ready, play immediately; otherwise statusChange will kick it.
      if (timelinePlayer.status === 'readyToPlay' || readyRef.current) {
        startIfNeeded();
      }
    } else {
      kickGenRef.current += 1;
      try {
        timelinePlayer.pause();
        followPlayer.pause();
      } catch {
        // ignore
      }
      emitStatus();
    }
  }, [shouldPlay, timelinePlayer, followPlayer, applyMute, startIfNeeded, emitStatus]);

  React.useEffect(() => {
    const statusSub = timelinePlayer.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') {
        readyRef.current = true;
        emitStatus();
        startIfNeeded();
      } else if (status === 'loading' || status === 'idle') {
        emitStatus();
      }
    });
    const playSub = timelinePlayer.addListener('playingChange', () => {
      syncFollow();
      emitStatus();
    });
    const timeSub = timelinePlayer.addListener('timeUpdate', () => {
      if (!shouldPlayRef.current) return;
      syncFollow();
      emitStatus();
    });
    const endSub = timelinePlayer.addListener('playToEnd', () => {
      try {
        if (replayOnEnd && shouldPlayRef.current) {
          timelinePlayer.currentTime = 0;
          followPlayer.currentTime = 0;
          timelinePlayer.play();
          followPlayer.play();
        } else {
          followPlayer.pause();
        }
      } catch {
        // ignore
      }
      emitStatus(true);
    });

    // Kick if already ready on mount.
    if (timelinePlayer.status === 'readyToPlay') {
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
  }, [timelinePlayer, followPlayer, replayOnEnd, syncFollow, startIfNeeded, emitStatus]);

  // Soft resync while playing — low frequency, never while offscreen.
  React.useEffect(() => {
    if (!shouldPlay) return;
    const id = setInterval(syncFollow, Math.max(300, syncIntervalMs));
    return () => clearInterval(id);
  }, [shouldPlay, syncIntervalMs, syncFollow]);

  const fillStyle = primaryStyle ?? StyleSheet.absoluteFillObject;
  const tileStyle = pipStyle ?? DEFAULT_PIP;
  const audioViewStyle = dualFrontIsPrimary ? tileStyle : fillStyle;
  const silentViewStyle = dualFrontIsPrimary ? fillStyle : tileStyle;
  const audioContentFit: VideoContentFit = dualFrontIsPrimary ? 'cover' : primaryContentFit;
  const silentContentFit: VideoContentFit = dualFrontIsPrimary ? primaryContentFit : 'cover';

  return (
    <View style={StyleSheet.absoluteFill}>
      {dualFrontIsPrimary ? (
        <>
          <VideoView
            style={silentViewStyle}
            player={silentPlayer}
            nativeControls={nativeControls}
            contentFit={silentContentFit}
            allowsFullscreen={nativeControls}
          />
          <View style={audioViewStyle} pointerEvents="none">
            <VideoView
              style={StyleSheet.absoluteFillObject}
              player={audioPlayer}
              nativeControls={false}
              contentFit={audioContentFit}
            />
          </View>
        </>
      ) : (
        <>
          <VideoView
            style={audioViewStyle}
            player={audioPlayer}
            nativeControls={nativeControls}
            contentFit={audioContentFit}
            allowsFullscreen={nativeControls}
          />
          <View style={silentViewStyle} pointerEvents="none">
            <VideoView
              style={StyleSheet.absoluteFillObject}
              player={silentPlayer}
              nativeControls={false}
              contentFit={silentContentFit}
            />
          </View>
        </>
      )}
    </View>
  );
}

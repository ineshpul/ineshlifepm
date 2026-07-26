import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { DualClipPlayback } from './DualClipPlayback';

type Props = {
  uri: string;
  /** Optional companion clip rendered as a muted PIP tile (BeReal-style dual recording). */
  secondaryUri?: string | null;
  /** When true, audio was captured on the PIP (back) clip because front was the big view. */
  dualFrontIsPrimary?: boolean;
  /** Loop the clip (Best Part compose). Default false with native controls (Leap review). */
  loop?: boolean;
  contentFit?: 'contain' | 'cover';
  /** Photo preview for proof / camera-roll leaps. */
  mediaType?: 'video' | 'photo';
};

/** Preview a recorded or picked clip. Uses `expo-video` because `expo-av` Video is deprecated on SDK 54. */
export function RecordClipPreview({
  uri,
  secondaryUri,
  dualFrontIsPrimary = false,
  loop = false,
  contentFit = 'contain',
  mediaType = 'video',
}: Props) {
  if (mediaType === 'photo') {
    return (
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={contentFit === 'cover' ? 'cover' : 'contain'}
      />
    );
  }

  if (secondaryUri) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <DualClipPlayback
          primaryUrl={uri}
          secondaryUrl={secondaryUri}
          dualFrontIsPrimary={dualFrontIsPrimary}
          shouldPlay
          isMuted={false}
          nativeControls
          replayOnEnd={loop}
          primaryContentFit={contentFit}
        />
      </View>
    );
  }

  return <SingleClipPreview uri={uri} loop={loop} contentFit={contentFit} />;
}

function SingleClipPreview({
  uri,
  loop,
  contentFit,
}: {
  uri: string;
  loop: boolean;
  contentFit: 'contain' | 'cover';
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = loop;
    p.muted = false;
    p.volume = 1;
  });

  React.useEffect(() => {
    try {
      player.loop = loop;
    } catch {
      // ignore
    }
  }, [player, loop]);

  React.useEffect(() => {
    // Wait a beat so AVAudioSession can leave record mode before decode/play.
    let cancelled = false;
    const t = setTimeout(() => {
      if (cancelled) return;
      try {
        player.currentTime = 0;
        player.play();
      } catch {
        // ignore
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
      try {
        player.pause();
      } catch {
        // ignore
      }
    };
  }, [player, uri]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls
      contentFit={contentFit}
      allowsFullscreen
    />
  );
}

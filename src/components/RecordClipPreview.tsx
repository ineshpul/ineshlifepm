import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { DualClipPlayback } from './DualClipPlayback';

type Props = {
  uri: string;
  /** Optional companion clip rendered as a muted PIP tile (BeReal-style dual recording). */
  secondaryUri?: string | null;
  /** When true, audio was captured on the PIP (back) clip because front was the big view. */
  dualFrontIsPrimary?: boolean;
};

/** Preview a recorded or picked clip. Uses `expo-video` because `expo-av` Video is deprecated on SDK 54. */
export function RecordClipPreview({ uri, secondaryUri, dualFrontIsPrimary = false }: Props) {
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
          primaryContentFit="contain"
        />
      </View>
    );
  }

  return <SingleClipPreview uri={uri} />;
}

function SingleClipPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });

  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        (player as { play?: () => void })?.play?.();
      } catch {
        // ignore
      }
    }, 150);
    return () => clearTimeout(t);
  }, [player]);

  return (
    <VideoView
      style={StyleSheet.absoluteFill}
      player={player}
      nativeControls
      contentFit="contain"
      allowsFullscreen
    />
  );
}

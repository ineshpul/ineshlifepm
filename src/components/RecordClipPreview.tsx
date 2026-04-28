import * as React from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = { uri: string };

/** Preview a recorded or picked clip. Uses `expo-video` because `expo-av` Video is deprecated on SDK 54. */
export function RecordClipPreview({ uri }: Props) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
  React.useEffect(() => {
    // Autoplay once after recording so users don't have to tap play.
    const t = setTimeout(() => {
      try {
        (player as any)?.play?.();
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

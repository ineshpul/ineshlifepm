import * as React from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = { uri: string };

/** Preview a recorded or picked clip. Uses `expo-video` because `expo-av` Video is deprecated on SDK 54. */
export function RecordClipPreview({ uri }: Props) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
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

import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

type Props = {
  uri: string;
  /** Optional companion clip rendered as a muted PIP tile (BeReal-style dual recording). */
  secondaryUri?: string | null;
};

/** Preview a recorded or picked clip. Uses `expo-video` because `expo-av` Video is deprecated on SDK 54. */
export function RecordClipPreview({ uri, secondaryUri }: Props) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = false;
  });
  // The PIP player is silenced so we don't double-up on audio; the primary clip
  // already carries the recording's audio track.
  const secondaryPlayer = useVideoPlayer(
    secondaryUri ? { uri: secondaryUri } : null,
    (p) => {
      p.loop = true;
      p.muted = true;
    }
  );
  React.useEffect(() => {
    // Autoplay once after recording so users don't have to tap play.
    const t = setTimeout(() => {
      try {
        (player as any)?.play?.();
      } catch {
        // ignore
      }
      try {
        (secondaryPlayer as any)?.play?.();
      } catch {
        // ignore
      }
    }, 150);
    return () => clearTimeout(t);
  }, [player, secondaryPlayer]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls
        contentFit="contain"
        allowsFullscreen
      />
      {secondaryUri ? (
        <View style={styles.pip} pointerEvents="none">
          <VideoView
            style={StyleSheet.absoluteFill}
            player={secondaryPlayer}
            nativeControls={false}
            contentFit="cover"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pip: {
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
  },
});

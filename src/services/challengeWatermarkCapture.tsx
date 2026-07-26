import * as React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import { loadAsync } from 'expo-font';
import { Outfit_600SemiBold, Outfit_700Bold } from '@expo-google-fonts/outfit';

import {
  VideoWatermarkOverlay,
  type VideoWatermarkOverlayProps,
  type VideoWatermarkVariant,
} from '../components/VideoWatermarkOverlay';

export type ChallengeWatermarkInfo = Pick<VideoWatermarkOverlayProps, 'title' | 'username'> & {
  variant?: VideoWatermarkVariant;
};

type ChallengeWatermarkCaptureRequest = ChallengeWatermarkInfo &
  Pick<VideoWatermarkOverlayProps, 'width' | 'height'>;

type PendingCapture = {
  info: ChallengeWatermarkCaptureRequest;
  resolve: (uri: string) => void;
  reject: (reason: unknown) => void;
};

let enqueueCapture: ((info: ChallengeWatermarkCaptureRequest) => Promise<string>) | null = null;
let watermarkFontsLoaded = false;

async function ensureWatermarkFontsLoaded(): Promise<void> {
  if (watermarkFontsLoaded) return;
  await loadAsync({
    Outfit_600SemiBold,
    Outfit_700Bold,
  });
  watermarkFontsLoaded = true;
}

export async function captureChallengeWatermarkPng(
  info: ChallengeWatermarkCaptureRequest
): Promise<string> {
  if (!enqueueCapture) {
    throw new Error('Challenge watermark capture is not ready yet. Try again in a moment.');
  }
  return enqueueCapture(info);
}

/** Fallback so a slow/failed logo load can never block a camera-roll save. */
const LOGO_READY_TIMEOUT_MS = 2500;

/** Off-screen host — mount once near the app root. */
export function ChallengeWatermarkCaptureHost() {
  const shotRef = React.useRef<ViewShotRef>(null);
  const [pending, setPending] = React.useState<PendingCapture | null>(null);
  const [fontsReady, setFontsReady] = React.useState(false);
  const [logoReady, setLogoReady] = React.useState(false);

  const handleLogoSettled = React.useCallback(() => setLogoReady(true), []);

  React.useEffect(() => {
    enqueueCapture = (info) =>
      new Promise<string>((resolve, reject) => {
        setPending({ info, resolve, reject });
      });
    return () => {
      enqueueCapture = null;
    };
  }, []);

  React.useEffect(() => {
    if (!pending) {
      setFontsReady(false);
      setLogoReady(false);
      return;
    }

    let cancelled = false;
    void ensureWatermarkFontsLoaded()
      .then(() => {
        if (!cancelled) setFontsReady(true);
      })
      .catch((e) => {
        pending.reject(e);
        if (!cancelled) setPending(null);
      });

    return () => {
      cancelled = true;
    };
  }, [pending]);

  // Don't wait forever on the logo — proceed after a short grace period.
  React.useEffect(() => {
    if (!pending || !fontsReady || logoReady) return;
    const timer = setTimeout(() => setLogoReady(true), LOGO_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [pending, fontsReady, logoReady]);

  React.useEffect(() => {
    if (!pending || !fontsReady || !logoReady) return;

    let cancelled = false;
    const run = async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled) return;

      try {
        const captured = await shotRef.current?.capture?.();
        if (!captured) throw new Error('Could not render the challenge watermark.');

        const dest = `${FileSystem.cacheDirectory}leap-challenge-watermark-${Date.now()}.png`;
        await FileSystem.copyAsync({ from: captured, to: dest });
        pending.resolve(dest);
      } catch (e) {
        pending.reject(e);
      } finally {
        if (!cancelled) setPending(null);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [pending, fontsReady, logoReady]);

  if (!pending) return null;

  if (!fontsReady) {
    return (
      <View style={styles.offscreen} pointerEvents="none">
        <ActivityIndicator />
      </View>
    );
  }

  const { title, username, width, height, variant } = pending.info;

  return (
    <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
      <ViewShot
        ref={shotRef}
        options={{ format: 'png', quality: 1, result: 'tmpfile', width, height }}
      >
        <VideoWatermarkOverlay
          title={title}
          username={username}
          width={width}
          height={height}
          variant={variant ?? 'leap'}
          onLogoSettled={handleLogoSettled}
        />
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -12000,
    top: 0,
    opacity: 1,
  },
});

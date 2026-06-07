import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';

import {
  ChallengeWatermarkCard,
  type ChallengeWatermarkCardProps,
} from '../components/ChallengeWatermarkCard';

export type ChallengeWatermarkInfo = ChallengeWatermarkCardProps;

type PendingCapture = {
  info: ChallengeWatermarkInfo;
  resolve: (uri: string) => void;
  reject: (reason: unknown) => void;
};

let enqueueCapture: ((info: ChallengeWatermarkInfo) => Promise<string>) | null = null;

export async function captureChallengeWatermarkPng(info: ChallengeWatermarkInfo): Promise<string> {
  if (!enqueueCapture) {
    throw new Error('Challenge watermark capture is not ready yet. Try again in a moment.');
  }
  return enqueueCapture(info);
}

/** Off-screen host — mount once near the app root. */
export function ChallengeWatermarkCaptureHost() {
  const shotRef = React.useRef<ViewShotRef>(null);
  const [pending, setPending] = React.useState<PendingCapture | null>(null);

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
    if (!pending) return;

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
  }, [pending]);

  if (!pending) return null;

  return (
    <View style={styles.offscreen} pointerEvents="none" collapsable={false}>
      <ViewShot ref={shotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
        <ChallengeWatermarkCard title={pending.info.title} />
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

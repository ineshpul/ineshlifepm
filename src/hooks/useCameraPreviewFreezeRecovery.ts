import * as React from 'react';
import type { CameraView } from 'expo-camera';

const FREEZE_MS = 2000;
/** Low-rate capture proves the preview pipeline is still producing frames. */
const HEARTBEAT_MS = 2200;
const RECOVER_COOLDOWN_MS = 4000;

type Options = {
  enabled: boolean;
  isRecording: boolean;
  recordingSecondsLeft: number | null;
  usesNativeDualPreview: boolean;
  dualTransitioning: boolean;
  cameraRef: React.RefObject<CameraView | null>;
  onRecover: () => void;
};

/**
 * Best-effort preview freeze recovery for the primary CameraView.
 * Uses periodic low-quality captures as a "frame alive" signal; if none succeed for 2s+, restart session.
 */
export function useCameraPreviewFreezeRecovery({
  enabled,
  isRecording,
  recordingSecondsLeft,
  usesNativeDualPreview,
  dualTransitioning,
  cameraRef,
  onRecover,
}: Options) {
  const lastPulseRef = React.useRef(Date.now());
  const recoverCooldownUntilRef = React.useRef(0);
  const onRecoverRef = React.useRef(onRecover);
  onRecoverRef.current = onRecover;

  const markPreviewPulse = React.useCallback(() => {
    lastPulseRef.current = Date.now();
  }, []);

  React.useEffect(() => {
    if (!enabled || usesNativeDualPreview || dualTransitioning) return undefined;

    let cancelled = false;

    const heartbeat = async () => {
      while (!cancelled) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, HEARTBEAT_MS));
        if (cancelled) break;
        if (isRecording || recordingSecondsLeft != null) continue;

        const cam = cameraRef.current;
        if (!cam) continue;

        try {
          await Promise.race([
            cam.takePictureAsync?.({
              quality: 0.03,
              skipProcessing: true,
              shutterSound: false,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
          ]);
          if (!cancelled) lastPulseRef.current = Date.now();
        } catch {
          /* preview may be stalled */
        }
      }
    };

    void heartbeat();
    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    usesNativeDualPreview,
    dualTransitioning,
    isRecording,
    recordingSecondsLeft,
    cameraRef,
  ]);

  React.useEffect(() => {
    if (!enabled || usesNativeDualPreview || dualTransitioning) return undefined;

    const id = setInterval(() => {
      if (isRecording || recordingSecondsLeft != null) return;
      if (Date.now() - lastPulseRef.current < FREEZE_MS) return;
      if (Date.now() < recoverCooldownUntilRef.current) return;

      recoverCooldownUntilRef.current = Date.now() + RECOVER_COOLDOWN_MS;
      console.log('[Record] camera preview freeze detected — restarting single-camera session');
      lastPulseRef.current = Date.now();
      onRecoverRef.current();
    }, 1000);

    return () => clearInterval(id);
  }, [
    enabled,
    usesNativeDualPreview,
    dualTransitioning,
    isRecording,
    recordingSecondsLeft,
  ]);

  return { markPreviewPulse };
}

import * as React from 'react';

const FREEZE_MS = 12_000;
const RECOVER_COOLDOWN_MS = 15_000;

type Options = {
  enabled: boolean;
  isRecording: boolean;
  recordingSecondsLeft: number | null;
  dualPipVisible: boolean;
  onRecover: () => void;
};

/**
 * Restarts the primary CameraView session if preview events stop for a long time.
 * Does not use takePictureAsync — that fails on many video previews and caused false recover loops.
 */
export function useCameraPreviewFreezeRecovery({
  enabled,
  isRecording,
  recordingSecondsLeft,
  dualPipVisible,
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
    if (!enabled || dualPipVisible) return undefined;

    const id = setInterval(() => {
      if (isRecording || recordingSecondsLeft != null) return;
      if (Date.now() - lastPulseRef.current < FREEZE_MS) return;
      if (Date.now() < recoverCooldownUntilRef.current) return;

      recoverCooldownUntilRef.current = Date.now() + RECOVER_COOLDOWN_MS;
      if (__DEV__) {
        console.log('[Record] camera preview stall — remounting CameraView');
      }
      lastPulseRef.current = Date.now();
      onRecoverRef.current();
    }, 3000);

    return () => clearInterval(id);
  }, [enabled, dualPipVisible, isRecording, recordingSecondsLeft]);

  return { markPreviewPulse };
}

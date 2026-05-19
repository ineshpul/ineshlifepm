import * as React from 'react';

import {
  canShowDualCameraToggle,
  hasDualCameraNativeModule,
  isDualCameraDeviceSupported,
  isExpoGoClient,
  loadRecordDualCameraModule,
  logDualCameraToggleAvailability,
  type RecordDualCameraModule,
} from '../lib/recordDualCamera';
import { useRecordDualPip } from './useRecordDualPip';

type Layout = { width: number; height: number };

export type DualToggleResult =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'no_module' | 'unsupported' };

/**
 * Native dual: one MultiCam preview (back + front). Expo Go: CameraView back + placeholder PiP.
 */
export function useRecordDualMode(cameraLayout: Layout) {
  const [showToggle, setShowToggle] = React.useState(() => canShowDualCameraToggle());

  React.useEffect(() => {
    setShowToggle(canShowDualCameraToggle());
    logDualCameraToggleAvailability();
  }, []);

  const [active, setActive] = React.useState(false);
  const [dualModule, setDualModule] = React.useState<RecordDualCameraModule | null>(null);
  const [toggleBusy, setToggleBusy] = React.useState(false);
  const [pipSuspended, setPipSuspended] = React.useState(false);

  const { pipRect, panGesture, resetPip } = useRecordDualPip(cameraLayout);

  const isExpoGo = isExpoGoClient();
  const hasNative = hasDualCameraNativeModule();

  /** Full-screen MultiCam preview — only path for live front + back on device builds. */
  const useMultiCamPreview =
    active &&
    !pipSuspended &&
    !isExpoGo &&
    dualModule != null &&
    cameraLayout.width > 0 &&
    cameraLayout.height > 0;

  const showExpoGoPip =
    active && !pipSuspended && isExpoGo && cameraLayout.width > 0;

  /** expo-camera drives preview whenever MultiCam is not active (single mode, recording, Expo Go). */
  const useCameraViewPreview = !useMultiCamPreview;
  const useBackCamera = active && !isExpoGo;

  const toggle = React.useCallback(async (): Promise<DualToggleResult> => {
    if (toggleBusy) return { ok: false, reason: 'busy' };

    if (active) {
      setActive(false);
      setDualModule(null);
      resetPip();
      return { ok: true };
    }

    setToggleBusy(true);
    try {
      if (isExpoGo) {
        setActive(true);
        return { ok: true };
      }

      if (!hasNative) {
        return { ok: false, reason: 'no_module' };
      }

      const mod = await loadRecordDualCameraModule();
      if (!mod) {
        return { ok: false, reason: 'no_module' };
      }

      const supported = await isDualCameraDeviceSupported();
      if (!supported) {
        return { ok: false, reason: 'unsupported' };
      }

      setDualModule(mod);
      setActive(true);
      return { ok: true };
    } finally {
      setToggleBusy(false);
    }
  }, [active, hasNative, isExpoGo, resetPip, toggleBusy]);

  const suspendPipForRecording = React.useCallback(() => {
    setPipSuspended(true);
  }, []);

  const resumePipAfterRecording = React.useCallback(() => {
    setPipSuspended(false);
  }, []);

  const resetDualMode = React.useCallback(() => {
    setActive(false);
    setDualModule(null);
    setPipSuspended(false);
    resetPip();
  }, [resetPip]);

  return {
    showToggle,
    active,
    toggleBusy,
    toggle,
    dualModule,
    pipRect,
    panGesture,
    useMultiCamPreview,
    useCameraViewPreview,
    useBackCamera,
    showExpoGoPip,
    pipSuspended,
    suspendPipForRecording,
    resumePipAfterRecording,
    resetDualMode,
    isExpoGo,
    hasNative,
  };
}

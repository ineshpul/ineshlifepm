import * as React from 'react';

import {
  canShowDualCameraToggle,
  canUseDualCameraNativePreview,
  isDualCameraDeviceSupported,
  isExpoGoClient,
  logDualCameraToggleAvailability,
} from '../lib/recordDualCamera';
import { useRecordDualPip } from './useRecordDualPip';

type Layout = { width: number; height: number };

export type DualToggleResult =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'no_module' | 'unsupported' };

/**
 * Native dual: DualCameraBackView + DualCameraFrontView (expo-dual-camera 55).
 * Expo Go: CameraView back + placeholder PiP.
 */
export function useRecordDualMode(cameraLayout: Layout) {
  const [showToggle, setShowToggle] = React.useState(() => canShowDualCameraToggle());

  React.useEffect(() => {
    setShowToggle(canShowDualCameraToggle());
    logDualCameraToggleAvailability();
  }, []);

  const [active, setActive] = React.useState(false);
  const [toggleBusy, setToggleBusy] = React.useState(false);
  const [pipSuspended, setPipSuspended] = React.useState(false);

  const { pipRect, panGesture, resetPip } = useRecordDualPip(cameraLayout);

  const isExpoGo = isExpoGoClient();

  const nativeDualPreview = canUseDualCameraNativePreview();

  const useMultiCamPreview =
    active &&
    !pipSuspended &&
    nativeDualPreview &&
    cameraLayout.width > 0 &&
    cameraLayout.height > 0;

  /** Expo Go only — placeholder PiP (no native dual module in that binary). */
  const showExpoGoPip =
    active && !pipSuspended && isExpoGo && cameraLayout.width > 0;

  /** Native dual records inside MultiCam — no stacked expo-camera recorder. */
  const useStackedBackRecordCamera = false;

  const useCameraViewPreview = !useMultiCamPreview && !useStackedBackRecordCamera;
  const useBackCamera = active && !isExpoGo;

  const toggle = React.useCallback(async (): Promise<DualToggleResult> => {
    if (toggleBusy) return { ok: false, reason: 'busy' };

    if (active) {
      setActive(false);
      resetPip();
      return { ok: true };
    }

    setToggleBusy(true);
    try {
      if (isExpoGo) {
        setActive(true);
        return { ok: true };
      }

      if (!nativeDualPreview) {
        return { ok: false, reason: 'no_module' };
      }

      const supported = await isDualCameraDeviceSupported();
      if (!supported) {
        return { ok: false, reason: 'unsupported' };
      }

      setActive(true);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'no_module' };
    } finally {
      setToggleBusy(false);
    }
  }, [active, isExpoGo, nativeDualPreview, resetPip, toggleBusy]);

  const suspendPipForRecording = React.useCallback(() => {
    setPipSuspended(true);
  }, []);

  const resumePipAfterRecording = React.useCallback(() => {
    setPipSuspended(false);
  }, []);

  const resetDualMode = React.useCallback(() => {
    setActive(false);
    setPipSuspended(false);
    resetPip();
  }, [resetPip]);

  return {
    showToggle,
    active,
    toggleBusy,
    toggle,
    pipRect,
    panGesture,
    useMultiCamPreview,
    useStackedBackRecordCamera,
    useCameraViewPreview,
    useBackCamera,
    showExpoGoPip,
    pipSuspended,
    suspendPipForRecording,
    resumePipAfterRecording,
    resetDualMode,
    isExpoGo,
  };
}

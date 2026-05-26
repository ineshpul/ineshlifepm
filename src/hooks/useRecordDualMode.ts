import * as React from 'react';

import {
  canShowDualCameraToggle,
  isDualCameraDeviceSupported,
  isExpoGoClient,
  logDualCameraToggleAvailability,
} from '../lib/recordDualCamera';
import { useRecordDualPip } from './useRecordDualPip';

type Layout = { width: number; height: number };

/** Let the single CameraView session fully release before mounting MultiCam (avoids iOS camera graph crashes). */
const MULTICAM_ARM_DELAY_MS = 480;

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
  /** When true, native MultiCam views may mount (delayed after `active` on real builds). */
  const [multiCamArmed, setMultiCamArmed] = React.useState(false);
  const [toggleBusy, setToggleBusy] = React.useState(false);
  const [pipSuspended, setPipSuspended] = React.useState(false);

  const { pipRect, panGesture, resetPip } = useRecordDualPip(cameraLayout);

  const isExpoGo = isExpoGoClient();

  React.useEffect(() => {
    if (!active || isExpoGo) {
      setMultiCamArmed(false);
      return;
    }
    const t = setTimeout(() => setMultiCamArmed(true), MULTICAM_ARM_DELAY_MS);
    return () => clearTimeout(t);
  }, [active, isExpoGo]);

  const useMultiCamPreview =
    active &&
    multiCamArmed &&
    !pipSuspended &&
    !isExpoGo &&
    cameraLayout.width > 0 &&
    cameraLayout.height > 0;

  const showExpoGoPip = active && !pipSuspended && isExpoGo && cameraLayout.width > 0;

  /** Native dual records inside MultiCam — no stacked expo-camera recorder. */
  const useStackedBackRecordCamera = false;

  const useCameraViewPreview = !useMultiCamPreview && !useStackedBackRecordCamera;
  const useBackCamera = active && !isExpoGo;

  const toggle = React.useCallback(async (): Promise<DualToggleResult> => {
    if (toggleBusy) return { ok: false, reason: 'busy' };

    if (active) {
      setMultiCamArmed(false);
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
  }, [active, isExpoGo, resetPip, toggleBusy]);

  const suspendPipForRecording = React.useCallback(() => {
    setPipSuspended(true);
  }, []);

  const resumePipAfterRecording = React.useCallback(() => {
    setPipSuspended(false);
  }, []);

  const resetDualMode = React.useCallback(() => {
    setMultiCamArmed(false);
    setActive(false);
    setPipSuspended(false);
    resetPip();
  }, [resetPip]);

  return {
    showToggle,
    active,
    /** True only after delay once native dual is on — MultiCam layer is mounting or mounted. */
    multiCamArmed,
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

import * as React from 'react';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { requireNativeModule } from 'expo';

import type { DualPipRect } from '../record/dualPipLayout';

/** True only in the Expo Go host app — not dev client, TestFlight, or App Store. */
export function isExpoGoClient(): boolean {
  return Constants.appOwnership === 'expo';
}

/** Native module present in this binary (TestFlight / dev client / store). */
export function hasDualCameraNativeModule(): boolean {
  if (isExpoGoClient()) return false;
  try {
    requireNativeModule('ExpoDualCamera');
    return true;
  } catch {
    return false;
  }
}

/** Show infinity toggle on real devices (capability checked when user taps). */
export function canShowDualCameraToggle(): boolean {
  if (!Device.isDevice) return __DEV__;
  return true;
}

export function logDualCameraToggleAvailability(): void {
  console.log('[Record] dual camera toggle', {
    visible: canShowDualCameraToggle(),
    isDevice: Device.isDevice,
    isExpoGo: isExpoGoClient(),
    applicationId: Application.applicationId ?? null,
    appOwnership: Constants.appOwnership ?? null,
    nativeModulePeek: hasDualCameraNativeModule(),
  });
}

export async function isDualCameraDeviceSupported(): Promise<boolean> {
  if (isExpoGoClient()) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isSupported } = require('expo-dual-camera') as typeof import('expo-dual-camera');
    return (await isSupported()) === true;
  } catch {
    return false;
  }
}

export type RecordDualMultiCamViewProps = {
  pipRect: DualPipRect;
  panGesture: ReturnType<typeof import('react-native-gesture-handler').Gesture.Pan>;
  onReady?: () => void;
};

/**
 * Load native dual-camera views only when needed (dev client / TestFlight).
 * Static imports crash Expo Go because the native module is not in that binary.
 */
export function loadRecordDualMultiCamView(): React.ComponentType<RecordDualMultiCamViewProps> | null {
  if (isExpoGoClient()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../components/RecordDualMultiCamView').RecordDualMultiCamView;
  } catch {
    return null;
  }
}

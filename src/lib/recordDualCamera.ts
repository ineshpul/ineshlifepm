import * as React from 'react';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { requireNativeModule } from 'expo';
import { Platform, UIManager } from 'react-native';

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

/**
 * JS can load `expo-dual-camera` while the **native view manager** is missing (Expo Go, old dev client).
 * Mounting `DualCameraFrontView` then crashes with ViewManagerAdapter_ExpoDualCamera undefined.
 */
export function hasDualCameraNativeViews(): boolean {
  if (isExpoGoClient() || !hasDualCameraNativeModule()) return false;
  if (Platform.OS === 'web') return false;
  try {
    // UIManager.getViewManagerConfig is unreliable on New Architecture; probe the view manager directly.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireNativeViewManager } = require('expo-modules-core') as {
      requireNativeViewManager: (name: string) => unknown;
    };
    const view = requireNativeViewManager('ExpoDualCamera');
    return view != null;
  } catch {
    try {
      const getConfig =
        UIManager.getViewManagerConfig ??
        (UIManager as { ViewManager?: { getViewManagerConfig?: (n: string) => unknown } }).ViewManager
          ?.getViewManagerConfig;
      if (typeof getConfig === 'function') {
        return getConfig('ExpoDualCamera') != null;
      }
    } catch {
      /* noop */
    }
    return false;
  }
}

/** Both TurboModule and native views are in this binary. */
export function canUseDualCameraNativePreview(): boolean {
  if (isExpoGoClient() || !hasDualCameraNativeModule()) return false;
  // iOS dev/TestFlight builds with the module linked should use native MultiCam even when
  // UIManager probes fail under New Architecture.
  if (Platform.OS === 'ios') return true;
  return hasDualCameraNativeViews();
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
    nativeViewsPeek: hasDualCameraNativeViews(),
  });
}

export async function isDualCameraDeviceSupported(): Promise<boolean> {
  if (isExpoGoClient() || !canUseDualCameraNativePreview()) return false;
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
  if (!canUseDualCameraNativePreview()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../components/RecordDualMultiCamView').RecordDualMultiCamView;
  } catch {
    return null;
  }
}

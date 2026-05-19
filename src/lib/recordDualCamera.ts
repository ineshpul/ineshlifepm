import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { requireNativeModule } from 'expo-modules-core';

export type RecordDualCameraModule = typeof import('expo-dual-camera');

let cachedModule: RecordDualCameraModule | null = null;

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

/** Show infinity toggle: Expo Go (placeholder PiP), or a build that includes expo-dual-camera. */
export function canShowDualCameraToggle(): boolean {
  if (isExpoGoClient()) return true;
  if (!Device.isDevice) {
    return __DEV__;
  }
  return hasDualCameraNativeModule();
}

export function logDualCameraToggleAvailability(): void {
  if (!__DEV__) return;
  console.log('[Record] dual camera toggle', {
    visible: canShowDualCameraToggle(),
    isDevice: Device.isDevice,
    isExpoGo: isExpoGoClient(),
    applicationId: Application.applicationId ?? null,
    appOwnership: Constants.appOwnership ?? null,
    nativeModulePeek: hasDualCameraNativeModule(),
  });
}

export async function loadRecordDualCameraModule(): Promise<RecordDualCameraModule | null> {
  if (isExpoGoClient() || !hasDualCameraNativeModule()) return null;
  if (cachedModule) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('expo-dual-camera') as RecordDualCameraModule;
    return cachedModule;
  } catch {
    return null;
  }
}

export async function isDualCameraDeviceSupported(): Promise<boolean> {
  const mod = await loadRecordDualCameraModule();
  if (!mod) return false;
  try {
    return (await mod.isSupported()) === true;
  } catch {
    return false;
  }
}

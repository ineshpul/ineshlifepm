import * as Application from 'expo-application';
import * as Device from 'expo-device';

import {
  confirmNativeDualCameraSupported,
  isExpoGoClient,
  peekExpoDualCameraNativeModule,
} from './expoDualCamera';

export type DualCameraSupport = {
  /** Show dual-camera toggle (physical device + native binary, not Expo Go). */
  deviceOk: boolean;
  /** True simultaneous preview via expo-dual-camera (set only after lazy init succeeds). */
  nativeDual: boolean;
};

export type DualCameraAvailabilityLog = {
  isDevice: boolean;
  isExpoGo: boolean;
  applicationId: string | null;
  nativeModulePeek: boolean;
  toggleVisible: boolean;
};

/** Structured log for TestFlight / device debugging (visible in Metro and native logs). */
export function logDualCameraAvailability(): DualCameraAvailabilityLog {
  const isDevice = Device.isDevice;
  const isExpoGo = isExpoGoClient();
  const applicationId = Application.applicationId ?? null;
  const nativeModulePeek = peekExpoDualCameraNativeModule();
  const toggleVisible = canOfferDualCameraToggle();
  const payload: DualCameraAvailabilityLog = {
    isDevice,
    isExpoGo,
    applicationId,
    nativeModulePeek,
    toggleVisible,
  };
  console.log('[Record] dual camera availability', payload);
  if (isDevice && !isExpoGo && !nativeModulePeek) {
    console.log(
      '[Record] dual camera: ExpoDualCamera native module not in this binary — rebuild with expo-dual-camera in app.json plugins'
    );
  }
  return payload;
}

/**
 * Whether the dual-camera toggle may appear. Does not load or start expo-dual-camera.
 * Toggle is shown on physical devices except Expo Go; native module is validated on tap.
 */
export function canOfferDualCameraToggle(): boolean {
  if (!Device.isDevice) {
    return false;
  }
  if (isExpoGoClient()) {
    return true;
  }
  return true;
}

/**
 * Lazy init after the user taps the toggle. Times out and returns false without throwing.
 */
export async function initializeNativeDualCamera(timeoutMs = 3000): Promise<boolean> {
  if (isExpoGoClient()) return false;
  if (!peekExpoDualCameraNativeModule()) return false;
  const nativeDual = await confirmNativeDualCameraSupported(timeoutMs);
  console.log('[Record] dual camera lazy init nativeDual:', nativeDual);
  return nativeDual;
}

/** @deprecated Use canOfferDualCameraToggle — kept for callers that expected async probe. */
export async function probeDualCameraSupport(): Promise<DualCameraSupport> {
  const deviceOk = canOfferDualCameraToggle();
  return { deviceOk, nativeDual: false };
}

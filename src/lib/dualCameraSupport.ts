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

/**
 * Whether the dual-camera toggle may appear. Does not load or start expo-dual-camera.
 */
export function canOfferDualCameraToggle(): boolean {
  if (!Device.isDevice) {
    if (__DEV__) console.log('[Record] dual camera: simulator — toggle hidden');
    return false;
  }
  if (isExpoGoClient()) {
    return true;
  }
  if (!peekExpoDualCameraNativeModule()) {
    if (__DEV__) {
      console.log(
        '[Record] dual camera: no native module in binary — toggle hidden (rebuild with expo-dual-camera plugin)'
      );
    }
    return false;
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
  if (__DEV__) console.log('[Record] dual camera lazy init nativeDual:', nativeDual);
  return nativeDual;
}

/** @deprecated Use canOfferDualCameraToggle — kept for callers that expected async probe. */
export async function probeDualCameraSupport(): Promise<DualCameraSupport> {
  const deviceOk = canOfferDualCameraToggle();
  return { deviceOk, nativeDual: false };
}

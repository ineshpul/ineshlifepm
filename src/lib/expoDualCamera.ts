import { requireNativeModule } from 'expo-modules-core';

export type ExpoDualCameraModule = typeof import('expo-dual-camera');

let cached: ExpoDualCameraModule | null | undefined;

/**
 * Load expo-dual-camera only when the native module is in the binary (custom dev/production build).
 * Returns null in Expo Go or builds compiled before the plugin was added — avoids a redbox on import.
 */
export function getExpoDualCameraModule(): ExpoDualCameraModule | null {
  if (cached !== undefined) return cached;
  try {
    requireNativeModule('ExpoDualCamera');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-dual-camera') as ExpoDualCameraModule;
    return cached;
  } catch (e) {
    if (__DEV__) {
      console.log(
        '[Record] expo-dual-camera unavailable (rebuild with expo-dual-camera in app.json plugins):',
        e
      );
    }
    cached = null;
    return null;
  }
}

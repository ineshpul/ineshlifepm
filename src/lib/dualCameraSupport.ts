import * as Device from 'expo-device';

import { getExpoDualCameraModule } from './expoDualCamera';

export type DualCameraSupport = {
  /** Show dual-camera toggle (physical device). */
  deviceOk: boolean;
  /** True simultaneous preview via expo-dual-camera native module. */
  nativeDual: boolean;
};

/**
 * Physical devices can toggle dual mode. Native multi-cam works in custom builds;
 * Expo Go uses a single-camera + front PiP fallback (see RecordScreen).
 */
export async function probeDualCameraSupport(): Promise<DualCameraSupport> {
  if (!Device.isDevice) {
    if (__DEV__) console.log('[Record] dual camera: simulator — toggle hidden');
    return { deviceOk: false, nativeDual: false };
  }

  const mod = getExpoDualCameraModule();
  if (!mod) {
    if (__DEV__) console.log('[Record] dual camera: Expo Go / build without native module — fallback preview');
    return { deviceOk: true, nativeDual: false };
  }

  try {
    const nativeDual = await mod.isSupported();
    if (__DEV__) console.log('[Record] dual camera native isSupported:', nativeDual);
    return { deviceOk: true, nativeDual };
  } catch (e) {
    if (__DEV__) console.log('[Record] dual camera isSupported error:', e);
    return { deviceOk: true, nativeDual: false };
  }
}

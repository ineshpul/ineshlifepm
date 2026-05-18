import * as Device from 'expo-device';

import { getExpoDualCameraModule } from './expoDualCamera';

/**
 * Device supports true simultaneous front + back preview (`AVCaptureMultiCamSession` / CameraX).
 * Requires a dev/production build that includes the expo-dual-camera native module.
 */
export async function probeDualCameraSupported(): Promise<boolean> {
  if (!Device.isDevice) {
    if (__DEV__) console.log('[Record] dual camera: unsupported (simulator)');
    return false;
  }
  const mod = getExpoDualCameraModule();
  if (!mod) return false;
  try {
    const ok = await mod.isSupported();
    if (__DEV__) console.log('[Record] dual camera isSupported:', ok);
    return ok;
  } catch (e) {
    if (__DEV__) console.log('[Record] dual camera isSupported error:', e);
    return false;
  }
}

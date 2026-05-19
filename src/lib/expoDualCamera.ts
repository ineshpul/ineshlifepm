import * as Application from 'expo-application';
import { requireNativeModule } from 'expo-modules-core';

export type ExpoDualCameraModule = typeof import('expo-dual-camera');

let loadedModuleCache: ExpoDualCameraModule | null = null;

/** True only in the Expo Go client, not dev client / TestFlight / App Store builds. */
export function isExpoGoClient(): boolean {
  return Application.applicationId === 'host.exp.exponent';
}

/**
 * Cheap check: native module registered in the binary (custom dev / TestFlight / production).
 * Does not import or initialize expo-dual-camera JS/native session.
 */
export function peekExpoDualCameraNativeModule(): boolean {
  if (isExpoGoClient()) return false;
  try {
    requireNativeModule('ExpoDualCamera');
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<null> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(null), ms);
  });
}

/**
 * Load expo-dual-camera only when the user enables dual mode (or explicit init).
 * Aborts after `timeoutMs` so a stuck native init cannot block the record screen.
 */
export async function loadExpoDualCameraModule(
  timeoutMs = 3000
): Promise<ExpoDualCameraModule | null> {
  if (loadedModuleCache) return loadedModuleCache;
  if (isExpoGoClient()) return null;
  if (!peekExpoDualCameraNativeModule()) return null;

  try {
    const mod = await Promise.race([
      (async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('expo-dual-camera') as ExpoDualCameraModule;
      })(),
      delay(timeoutMs),
    ]);
    if (mod) loadedModuleCache = mod;
    return mod ?? null;
  } catch (e) {
    if (__DEV__) {
      console.log('[Record] expo-dual-camera load failed:', e);
    }
    return null;
  }
}

/**
 * Full native capability check (lazy). Returns false on timeout, error, or unsupported device.
 */
export async function confirmNativeDualCameraSupported(timeoutMs = 3000): Promise<boolean> {
  const mod = await loadExpoDualCameraModule(timeoutMs);
  if (!mod) return false;

  try {
    const supported = await Promise.race([
      mod.isSupported(),
      delay(timeoutMs).then(() => false),
    ]);
    return supported === true;
  } catch (e) {
    if (__DEV__) console.log('[Record] expo-dual-camera isSupported failed:', e);
    return false;
  }
}

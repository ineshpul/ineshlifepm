import Constants from 'expo-constants';

/**
 * Reads `expo.extra` from every place Expo may embed it (dev client, Expo Go, Updates, legacy manifest).
 * Fixes stale or missing `expoConfig.extra` so flags like `requireLoginEmailOtp` match app.json.
 */
export function getExpoExtra(): Record<string, unknown> {
  const c = Constants as Record<string, unknown>;
  const fromExpoConfig = (Constants.expoConfig as { extra?: Record<string, unknown> } | null)?.extra;
  const fromManifest = (c.manifest as { extra?: Record<string, unknown> } | undefined)?.extra;
  const fromManifest2 = (c.manifest2 as { extra?: Record<string, unknown> } | undefined)?.extra;
  const merged = { ...fromManifest, ...fromManifest2, ...fromExpoConfig };
  return merged && typeof merged === 'object' ? merged : {};
}

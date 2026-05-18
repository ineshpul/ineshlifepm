import Constants from 'expo-constants';
import { Platform } from 'react-native';

type FirebaseAnalytics = ReturnType<
  typeof import('@react-native-firebase/analytics').default
>;

let analyticsInstance: FirebaseAnalytics | null | undefined;

/** Native Firebase Analytics (iOS EAS builds only; no-op in Expo Go / web). */
function analytics(): FirebaseAnalytics | null {
  if (Platform.OS !== 'ios') return null;
  if (analyticsInstance !== undefined) return analyticsInstance;
  // Expo Go cannot load React Native Firebase native modules.
  if (Constants.executionEnvironment === 'storeClient') {
    analyticsInstance = null;
    return null;
  }
  try {
    const getAnalytics = require('@react-native-firebase/analytics')
      .default as typeof import('@react-native-firebase/analytics').default;
    analyticsInstance = getAnalytics();
    return analyticsInstance;
  } catch {
    analyticsInstance = null;
    return null;
  }
}

/** Enable collection and log an app open once per cold start. */
export async function initNativeAnalytics(): Promise<void> {
  const a = analytics();
  if (!a) return;
  try {
    await a.setAnalyticsCollectionEnabled(true);
    await a.logAppOpen();
  } catch {
    // ignore — analytics must never break the app
  }
}

export async function setNativeAnalyticsUserId(uid: string | null): Promise<void> {
  const a = analytics();
  if (!a) return;
  try {
    await a.setUserId(uid);
  } catch {
    // ignore
  }
}

export async function logNativeScreenView(screenName: string): Promise<void> {
  const a = analytics();
  if (!a || !screenName) return;
  try {
    await a.logScreenView({
      screen_name: screenName,
      screen_class: screenName,
    });
  } catch {
    // ignore
  }
}

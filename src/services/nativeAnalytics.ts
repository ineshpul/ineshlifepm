import Constants from 'expo-constants';
import { Platform } from 'react-native';

type FirebaseAnalytics = ReturnType<
  typeof import('@react-native-firebase/analytics').default
>;

export type EngagementMetric = 'posting' | 'scrolling' | 'chatting';

let analyticsInstance: FirebaseAnalytics | null | undefined;
let lastScrollingLogMs = 0;

const SCROLLING_THROTTLE_MS = 30_000;

/** Native Firebase Analytics (iOS EAS builds only; no-op in Expo Go / web). */
function analytics(): FirebaseAnalytics | null {
  if (Platform.OS !== 'ios') return null;
  if (analyticsInstance !== undefined) return analyticsInstance;
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

/**
 * Core engagement metrics for Firebase / GA4.
 * Event `engagement` with param `engagement_type`, plus `engagement_<type>` for simple dashboards.
 */
export async function logEngagementMetric(
  metric: EngagementMetric,
  params?: Record<string, string | number>
): Promise<void> {
  const a = analytics();
  if (!a) return;
  try {
    const safeParams: Record<string, string | number> = { engagement_type: metric, ...params };
    await a.logEvent('engagement', safeParams);
    await a.logEvent(`engagement_${metric}`, params ?? {});
  } catch {
    // ignore
  }
}

/** Throttled feed scroll signal (at most once per 30s per session). */
export function logEngagementScrollingThrottled(): void {
  const now = Date.now();
  if (now - lastScrollingLogMs < SCROLLING_THROTTLE_MS) return;
  lastScrollingLogMs = now;
  void logEngagementMetric('scrolling');
}

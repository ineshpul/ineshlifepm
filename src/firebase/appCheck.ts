import Constants from 'expo-constants';
import { CustomProvider, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { Platform } from 'react-native';

import { getFirebaseApp, isFirebaseConfigured } from './firebase';

let initStarted = false;

/**
 * Attaches App Check tokens to Firebase JS SDK requests (Firestore, Auth, Callable, Storage).
 * Native builds use @react-native-firebase/app-check; web uses reCAPTCHA v3 when configured.
 */
export async function initAppCheck(): Promise<void> {
  if (initStarted || !isFirebaseConfigured()) return;
  initStarted = true;

  const app = getFirebaseApp();

  if (Platform.OS === 'web') {
    const siteKey = String(Constants.expoConfig?.extra?.recaptchaSiteKey ?? '').trim();
    if (!siteKey) return;
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rnfbAppCheck = require('@react-native-firebase/app-check').default as {
      (): {
        newReactNativeFirebaseAppCheckProvider: () => {
          configure: (opts: {
            android?: { provider: string };
            apple?: { provider: string };
          }) => void;
        };
        initializeAppCheck: (opts: {
          provider: unknown;
          isTokenAutoRefreshEnabled: boolean;
        }) => Promise<void>;
        getToken: (forceRefresh: boolean) => Promise<{ token: string }>;
      };
    };

    const provider = rnfbAppCheck().newReactNativeFirebaseAppCheckProvider();
    provider.configure({
      android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
      apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
    });
    await rnfbAppCheck().initializeAppCheck({
      provider,
      isTokenAutoRefreshEnabled: true,
    });

    const debugToken = String(Constants.expoConfig?.extra?.appCheckDebugToken ?? '').trim();
    if (__DEV__ && debugToken) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }

    initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: async () => {
          const { token } = await rnfbAppCheck().getToken(false);
          return {
            token,
            expireTimeMillis: Date.now() + 55 * 60 * 1000,
          };
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    if (__DEV__) {
      console.warn('[AppCheck] Native provider not available — rebuild dev client after adding @react-native-firebase/app-check', e);
    }
  }
}

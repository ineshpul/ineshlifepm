import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { initializeApp, getApp, getApps } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

import { getFirebaseConfig } from './config';

/** Web typings omit this; it exists in the bundle Expo/Metro uses for React Native. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => import('firebase/auth').Persistence;
};

export function isFirebaseConfigured() {
  return getFirebaseConfig() != null;
}

export function getFirebaseApp() {
  const cfg = getFirebaseConfig();
  if (!cfg) {
    throw new Error(
      'Firebase is not configured. Fill expo.extra.firebase in app.json (apiKey, projectId, appId).'
    );
  }
  if (getApps().length) return getApp();
  return initializeApp(cfg);
}

let cachedAuth: Auth | null = null;

function isExpoGoRuntime() {
  return Constants.appOwnership === 'expo';
}

/**
 * Single Auth instance for dev builds / production.
 * Expo Go (especially iOS): always `getAuth(app)` — no module cache — so Metro hot reload cannot leave a
 * stale `initializeAuth` instance, and we avoid AsyncStorage persistence quirks with the RN Firebase SDK.
 * (Session resets when Expo Go fully restarts; that is fine for development.)
 */
export function firebaseAuth(): Auth {
  const app = getFirebaseApp();

  if (isExpoGoRuntime()) {
    return getAuth(app);
  }

  if (cachedAuth) return cachedAuth;
  try {
    cachedAuth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

export function firestore() {
  return getFirestore(getFirebaseApp());
}

export function storage() {
  return getStorage(getFirebaseApp());
}

export function firebaseFunctions() {
  return getFunctions(getFirebaseApp(), 'us-central1');
}


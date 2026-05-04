import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApp, getApps } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { browserLocalPersistence, getAuth, initializeAuth } from 'firebase/auth';
import { Platform } from 'react-native';
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
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

/**
 * Single Auth instance with durable persistence so users stay signed in across app restarts.
 * - Native: AsyncStorage via `getReactNativePersistence`.
 * - Web (Expo): `browserLocalPersistence` (localStorage).
 * `initializeAuth` throws if Auth was already created (e.g. Metro fast refresh); then we reuse `getAuth`.
 */
export function firebaseAuth(): Auth {
  const app = getFirebaseApp();

  if (cachedAuth) return cachedAuth;
  try {
    cachedAuth = initializeAuth(app, {
      persistence:
        Platform.OS === 'web'
          ? browserLocalPersistence
          : getReactNativePersistence(AsyncStorage),
    });
  } catch {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

let firestoreInstance: ReturnType<typeof getFirestore> | null = null;

/** Single Firestore instance. Memory cache speeds repeat reads in-session (e.g. re-opening chats). */
export function firestore() {
  if (firestoreInstance) return firestoreInstance;
  const app = getFirebaseApp();
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache(),
    });
  } catch {
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

export function storage() {
  return getStorage(getFirebaseApp());
}

export function firebaseFunctions() {
  return getFunctions(getFirebaseApp(), 'us-central1');
}


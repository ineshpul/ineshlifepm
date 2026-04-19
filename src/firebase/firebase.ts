import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApp, getApps } from 'firebase/app';
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

export function firebaseAuth() {
  const app = getFirebaseApp();
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
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


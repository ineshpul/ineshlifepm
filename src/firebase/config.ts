import Constants from 'expo-constants';

export type FirebaseConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

function readExtra(): any {
  // Expo Go: Constants.expoConfig is present; in some native contexts it may be Constants.manifest.
  return (Constants.expoConfig as any)?.extra ?? (Constants as any)?.manifest?.extra ?? {};
}

export function getFirebaseConfig(): FirebaseConfig | null {
  const extra = readExtra();
  const cfg = extra?.firebase;
  if (!cfg) return null;
  const apiKey = String(cfg.apiKey ?? '');
  const projectId = String(cfg.projectId ?? '');
  const appId = String(cfg.appId ?? '');
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain: cfg.authDomain,
    projectId,
    storageBucket: cfg.storageBucket,
    messagingSenderId: cfg.messagingSenderId,
    appId,
  };
}


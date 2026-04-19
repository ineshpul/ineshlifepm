import { getExpoExtra } from '../config/expoExtra';

export type FirebaseConfig = {
  apiKey: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
};

export function getFirebaseConfig(): FirebaseConfig | null {
  const extra = getExpoExtra();
  const cfg = extra.firebase as Record<string, unknown> | undefined;
  if (!cfg || typeof cfg !== 'object') return null;
  const apiKey = String(cfg.apiKey ?? '');
  const projectId = String(cfg.projectId ?? '');
  const appId = String(cfg.appId ?? '');
  if (!apiKey || !projectId || !appId) return null;
  return {
    apiKey,
    authDomain: cfg.authDomain != null ? String(cfg.authDomain) : undefined,
    projectId,
    storageBucket: cfg.storageBucket != null ? String(cfg.storageBucket) : undefined,
    messagingSenderId: cfg.messagingSenderId != null ? String(cfg.messagingSenderId) : undefined,
    appId,
  };
}


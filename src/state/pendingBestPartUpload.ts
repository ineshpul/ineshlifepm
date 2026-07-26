import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BestPartPostUploadParams } from '../services/bestPartUpload';

const KEY = 'leap.pendingBestPartUpload.v1';

export type PersistedPendingBestPart = {
  params: BestPartPostUploadParams;
  primaryStoragePath: string;
  secondaryStoragePath: string | null;
  savedAtMs: number;
};

export async function loadPendingBestPartUpload(): Promise<PersistedPendingBestPart | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPendingBestPart;
    if (!parsed?.params?.uid || !parsed.primaryStoragePath) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePendingBestPartUpload(job: PersistedPendingBestPart): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(job));
}

export async function clearPendingBestPartUpload(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

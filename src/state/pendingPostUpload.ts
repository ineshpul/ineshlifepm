import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PostVideoUploadParams } from '../services/postVideoUpload';

const KEY = 'leap.pendingPostUpload.v1';

export type PersistedPendingPost = {
  params: PostVideoUploadParams;
  primaryStoragePath: string;
  secondaryStoragePath: string | null;
  savedAtMs: number;
};

export async function loadPendingPostUpload(): Promise<PersistedPendingPost | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedPendingPost;
    if (!parsed?.params?.uid || !parsed.primaryStoragePath) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function savePendingPostUpload(job: PersistedPendingPost): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(job));
}

export async function clearPendingPostUpload(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

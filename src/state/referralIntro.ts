import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'leap.referralIntroSeen.v1';

function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}.${uid}`;
}

export async function shouldShowReferralIntro(uid: string): Promise<boolean> {
  if (!uid) return false;
  const seen = await AsyncStorage.getItem(storageKey(uid));
  return seen !== '1';
}

export async function markReferralIntroSeen(uid: string): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(storageKey(uid), '1');
}

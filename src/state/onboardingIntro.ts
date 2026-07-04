import AsyncStorage from '@react-native-async-storage/async-storage';

const LEGACY_STORAGE_KEY = 'leap.onboardingIntroCompleted.v1';

function storageKey(uid: string): string {
  return `leap.onboardingIntroCompleted.v1.${uid}`;
}

export async function hasCompletedOnboardingIntro(uid: string): Promise<boolean> {
  const key = storageKey(uid);
  if ((await AsyncStorage.getItem(key)) === '1') return true;
  // Device-wide flag from pre-signup onboarding; migrate so existing users aren't re-shown.
  if ((await AsyncStorage.getItem(LEGACY_STORAGE_KEY)) === '1') {
    await AsyncStorage.setItem(key, '1');
    return true;
  }
  return false;
}

export async function markOnboardingIntroCompleted(uid: string): Promise<void> {
  await AsyncStorage.setItem(storageKey(uid), '1');
}

/** Lets Settings → Replay intro show the flow again on next launch gate (optional). */
export async function resetOnboardingIntroCompleted(uid: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(uid));
}

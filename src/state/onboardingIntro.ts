import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'leap.onboardingIntroCompleted.v1';

export async function hasCompletedOnboardingIntro(): Promise<boolean> {
  return (await AsyncStorage.getItem(STORAGE_KEY)) === '1';
}

export async function markOnboardingIntroCompleted(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, '1');
}

/** Lets Settings → Replay intro show the flow again on next launch gate (optional). */
export async function resetOnboardingIntroCompleted(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

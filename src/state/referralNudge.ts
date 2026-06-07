import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCurrentWeekKeyFromMs } from '../lib/getCurrentWeekKey';

const STORAGE_KEY = 'leap.referralNudgeWeekKey.v1';

export async function shouldShowReferralWeeklyNudge(): Promise<boolean> {
  const weekKey = getCurrentWeekKeyFromMs(Date.now());
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  return stored !== weekKey;
}

export async function markReferralWeeklyNudgeShown(): Promise<void> {
  const weekKey = getCurrentWeekKeyFromMs(Date.now());
  await AsyncStorage.setItem(STORAGE_KEY, weekKey);
}

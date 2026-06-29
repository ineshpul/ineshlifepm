import AsyncStorage from '@react-native-async-storage/async-storage';

const keyFor = (uid: string, viewingChallengeDateKey: string) =>
  `leap.referralNudgeShown.v1.${uid}.${viewingChallengeDateKey}`;

/** Whether the invite nudge was already shown (or dismissed) this leap cycle. */
export async function loadReferralNudgeShownForDay(
  uid: string,
  viewingChallengeDateKey: string
): Promise<boolean> {
  if (!uid || !viewingChallengeDateKey) return false;
  try {
    return (await AsyncStorage.getItem(keyFor(uid, viewingChallengeDateKey))) === '1';
  } catch {
    return false;
  }
}

export async function persistReferralNudgeShownForDay(
  uid: string,
  viewingChallengeDateKey: string
): Promise<void> {
  if (!uid || !viewingChallengeDateKey) return;
  try {
    await AsyncStorage.setItem(keyFor(uid, viewingChallengeDateKey), '1');
  } catch {
    // ignore — in-memory dismiss still applies this session
  }
}

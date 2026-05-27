import AsyncStorage from '@react-native-async-storage/async-storage';

/** User finished preview (3 swipes) or skipped — no more watching until they post. */
const keyFor = (uid: string, challengeDate: string) =>
  `leap.feedPreviewLocked.v1.${uid}.${challengeDate}`;

export async function loadFeedPreviewConsumed(
  uid: string,
  challengeDate: string
): Promise<boolean> {
  if (!uid || !challengeDate) return false;
  try {
    return (await AsyncStorage.getItem(keyFor(uid, challengeDate))) === '1';
  } catch {
    return false;
  }
}

export async function persistFeedPreviewConsumed(
  uid: string,
  challengeDate: string
): Promise<void> {
  if (!uid || !challengeDate) return;
  try {
    await AsyncStorage.setItem(keyFor(uid, challengeDate), '1');
  } catch {
    // ignore — in-memory state still applies this session
  }
}

export async function clearFeedPreviewConsumed(
  uid: string,
  challengeDate: string
): Promise<void> {
  if (!uid || !challengeDate) return;
  try {
    await AsyncStorage.removeItem(keyFor(uid, challengeDate));
  } catch {
    // ignore
  }
}

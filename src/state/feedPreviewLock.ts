import AsyncStorage from '@react-native-async-storage/async-storage';

/** User skipped preview or finished swiping — no more watching until they post. */
const consumedKeyFor = (uid: string, challengeDate: string) =>
  `leap.feedPreviewLocked.v2.${uid}.${challengeDate}`;

/** User tapped Preview but has not skipped or finished swiping yet. */
const startedKeyFor = (uid: string, challengeDate: string) =>
  `leap.feedPreviewStarted.v2.${uid}.${challengeDate}`;

export async function loadFeedPreviewConsumed(
  uid: string,
  challengeDate: string
): Promise<boolean> {
  if (!uid || !challengeDate) return false;
  try {
    return (await AsyncStorage.getItem(consumedKeyFor(uid, challengeDate))) === '1';
  } catch {
    return false;
  }
}

export async function loadFeedPreviewStarted(
  uid: string,
  challengeDate: string
): Promise<boolean> {
  if (!uid || !challengeDate) return false;
  try {
    return (await AsyncStorage.getItem(startedKeyFor(uid, challengeDate))) === '1';
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
    await AsyncStorage.setItem(consumedKeyFor(uid, challengeDate), '1');
    await AsyncStorage.removeItem(startedKeyFor(uid, challengeDate));
  } catch {
    // ignore — in-memory state still applies this session
  }
}

export async function persistFeedPreviewStarted(
  uid: string,
  challengeDate: string
): Promise<void> {
  if (!uid || !challengeDate) return;
  try {
    await AsyncStorage.setItem(startedKeyFor(uid, challengeDate), '1');
  } catch {
    // ignore
  }
}

export async function clearFeedPreviewConsumed(
  uid: string,
  challengeDate: string
): Promise<void> {
  if (!uid || !challengeDate) return;
  try {
    await AsyncStorage.multiRemove([
      consumedKeyFor(uid, challengeDate),
      startedKeyFor(uid, challengeDate),
    ]);
  } catch {
    // ignore
  }
}

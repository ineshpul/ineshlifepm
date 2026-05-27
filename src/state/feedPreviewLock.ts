import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_PREFIX = 'leap.feedPreview.exhausted.v1';

function storageKey(uid: string, challengeDateKey: string): string {
  return `${KEY_PREFIX}.${uid}.${challengeDateKey}`;
}

/** True once the user has used their limited feed preview scrolls for this leap cycle. */
export async function isFeedPreviewExhausted(
  uid: string,
  challengeDateKey: string
): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(storageKey(uid, challengeDateKey))) === '1';
  } catch {
    return false;
  }
}

export async function markFeedPreviewExhausted(
  uid: string,
  challengeDateKey: string
): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(uid, challengeDateKey), '1');
  } catch {
    /* noop */
  }
}

import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const IOS_APP_STORE_URL =
  'https://apps.apple.com/us/app/leap-one-day-one-leap/id6764062329';

export async function requestAppStoreReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // fall through to store link
  }

  if (Platform.OS === 'ios') {
    await Linking.openURL(IOS_APP_STORE_URL);
  }
}

import { Linking, Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

const IOS_APP_STORE_URL =
  'https://apps.apple.com/us/app/leap-one-day-one-leap/id6764062329';
const IOS_WRITE_REVIEW_URL = `${IOS_APP_STORE_URL}?action=write-review`;

export type AppStoreReviewOptions = {
  /** User tapped a review CTA — open the App Store when the native sheet cannot show. */
  explicit?: boolean;
};

export async function requestAppStoreReview(options?: AppStoreReviewOptions): Promise<void> {
  if (options?.explicit) {
    if (Platform.OS === 'ios') {
      await Linking.openURL(IOS_WRITE_REVIEW_URL);
    }
    return;
  }

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

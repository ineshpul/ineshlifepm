import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const STORAGE_KEY = 'leap.notificationSchedule.v2';
const ANDROID_CHANNEL_ID = 'leap-reminders';

/** Register once at module load (Expo recommends setting this as early as possible). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Leap reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

let syncInFlight: Promise<void> | null = null;

/**
 * Daily streak / challenge reminders are sent by Cloud Functions at fire time
 * (fresh posted count + skip if user already posted). Clear any legacy local schedules.
 */
export async function syncLeapScheduledNotifications(_opts: {
  masterEnabled: boolean;
  streakReminders: boolean;
  hasPostedToday?: boolean;
}) {
  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = (async () => {
    await ensureAndroidChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEY);
  })();

  try {
    await syncInFlight;
  } catch {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  } finally {
    syncInFlight = null;
  }
}

/** First app install / legacy: enable reminders with defaults. */
export async function setupLeapNotifications() {
  await syncLeapScheduledNotifications({ masterEnabled: true, streakReminders: true, hasPostedToday: false });
}

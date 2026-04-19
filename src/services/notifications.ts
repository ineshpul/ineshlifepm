import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { IosAuthorizationStatus } from 'expo-notifications';

import { nextNyFireUtcMs } from '../utils/nyTime';

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

function dateTriggerAtUtcMs(utcMs: number): Notifications.DateTriggerInput {
  const d = new Date(utcMs);
  const safeMs = Number.isFinite(d.getTime()) ? d.getTime() : Date.now() + 60_000;
  const lead = Math.max(safeMs, Date.now() + 5000);
  const base: Notifications.DateTriggerInput = {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date: new Date(lead),
  };
  if (Platform.OS === 'android') {
    return { ...base, channelId: ANDROID_CHANNEL_ID };
  }
  return base;
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Leap reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function isGranted(status: Notifications.NotificationPermissionsStatus) {
  return (
    status.granted ||
    status.ios?.status === IosAuthorizationStatus.PROVISIONAL ||
    status.ios?.status === IosAuthorizationStatus.AUTHORIZED
  );
}

let syncInFlight: Promise<void> | null = null;

/**
 * Daily streak / challenge reminders. Controlled by Settings: master notifications + streak reminders.
 */
export async function syncLeapScheduledNotifications(opts: {
  masterEnabled: boolean;
  streakReminders: boolean;
}) {
  if (syncInFlight) {
    await syncInFlight;
    return;
  }

  syncInFlight = (async () => {
    await ensureAndroidChannel();
    await Notifications.cancelAllScheduledNotificationsAsync();
    await AsyncStorage.removeItem(STORAGE_KEY);

    if (!opts.masterEnabled || !opts.streakReminders) {
      return;
    }

    let perms = await Notifications.getPermissionsAsync();
    if (!isGranted(perms)) {
      perms = await Notifications.requestPermissionsAsync();
    }
    if (!isGranted(perms)) {
      return;
    }

    const tNoon = nextNyFireUtcMs(12, 0);
    const tLate = nextNyFireUtcMs(22, 30);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Today’s Leap is live',
        body: 'Open Leap and post before midnight.',
      },
      trigger: dateTriggerAtUtcMs(tNoon),
    });

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Don’t lose your streak',
        body: 'You still have time to post today’s challenge.',
      },
      trigger: dateTriggerAtUtcMs(tLate),
    });

    await AsyncStorage.setItem(STORAGE_KEY, '1');
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
  await syncLeapScheduledNotifications({ masterEnabled: true, streakReminders: true });
}

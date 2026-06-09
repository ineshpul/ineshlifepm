import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { IosAuthorizationStatus } from 'expo-notifications';

import { statsDocKeysForLeapDay } from '../lib/leapDayKey';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { readChallengeCache, writeChallengeCache } from '../state/challengeCache';
import { computeFeedViewingFromNow, nextNyFireUtcMs } from '../utils/nyTime';

const STATS_COLLECTION = 'dailyChallengeStats';

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
    importance: Notifications.AndroidImportance.HIGH,
  });
}

const NOTIFICATION_PROMPT_MAX = 150;

function truncateForNotification(text: string, max = NOTIFICATION_PROMPT_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function approvedCountFromStats(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const n = Number(data.approvedPostCount);
  if (Number.isFinite(n) && n >= 0) return n;
  const counted = data.countedApprovedVideoIds;
  if (counted && typeof counted === 'object' && !Array.isArray(counted)) {
    const keys = Object.keys(counted as Record<string, unknown>).filter((k) =>
      Boolean((counted as Record<string, unknown>)[k])
    );
    if (keys.length > 0) return keys.length;
  }
  return null;
}

async function resolvePostedCount(dateKey: string, atMs = Date.now()): Promise<number> {
  const keys = statsDocKeysForLeapDay(dateKey, atMs);
  if (!isFirebaseConfigured() || keys.length === 0) return 0;

  let total = 0;
  let hasAny = false;
  await Promise.all(
    keys.map(async (key) => {
      try {
        const snap = await getDoc(doc(firestore(), STATS_COLLECTION, key));
        const n = approvedCountFromStats(
          snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
        );
        if (n != null) {
          hasAny = true;
          total += n;
        }
      } catch {
        // ignore read errors
      }
    })
  );
  return hasAny ? total : 0;
}

async function resolveChallengePrompt(dateKey: string): Promise<string | null> {
  const cached = await readChallengeCache(dateKey);
  const cachedTitle = cached?.title?.trim();
  if (cachedTitle) return cachedTitle;

  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(doc(firestore(), 'challenges', dateKey));
    if (!snap.exists()) return null;
    const data = snap.data();
    const title = String(data?.title ?? '').trim();
    if (!title) return null;
    void writeChallengeCache({
      dateKey,
      title,
      subtitle: String(data?.subtitle ?? ''),
      maxDurationSeconds: Number(data?.maxDurationSeconds) || 60,
      maxRecordingAttempts: Number(data?.maxRecordingAttempts) || 3,
    });
    return title;
  } catch {
    return null;
  }
}

function leapLiveNotificationContent(prompt: string | null): Notifications.NotificationContentInput {
  return {
    title: 'Today’s Leap is live',
    body: prompt
      ? truncateForNotification(prompt)
      : 'Open Leap and post before midnight.',
    interruptionLevel: 'timeSensitive',
    ...(Platform.OS === 'android' ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
  };
}

function afternoonLeapNotificationContent(postedCount: number): Notifications.NotificationContentInput {
  const body =
    postedCount <= 0
      ? 'Be the first to take today’s leap.'
      : postedCount === 1
        ? 'Join 1 person who posted and take today’s leap.'
        : `Join ${postedCount} people who posted and take today’s leap.`;
  return {
    title: 'People are leaping',
    body,
    interruptionLevel: 'timeSensitive',
    ...(Platform.OS === 'android' ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
  };
}

function streakReminderNotificationContent(prompt: string | null): Notifications.NotificationContentInput {
  const base = prompt
    ? `${truncateForNotification(prompt)} — You still have time to post today.`
    : 'You still have time to post today’s challenge.';
  return {
    title: 'Don’t lose your streak',
    body: base,
    interruptionLevel: 'timeSensitive',
    ...(Platform.OS === 'android' ? { priority: Notifications.AndroidNotificationPriority.HIGH } : {}),
  };
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

    if (!opts.masterEnabled || !opts.streakReminders) {
      return;
    }
    // If you already posted today, do not schedule “still time to post” reminders.
    // We'll resync automatically when a new day starts / posting state changes.
    if (opts.hasPostedToday) return;

    let perms = await Notifications.getPermissionsAsync();
    if (!isGranted(perms)) {
      perms = await Notifications.requestPermissionsAsync();
    }
    if (!isGranted(perms)) {
      return;
    }

    const tNoon = nextNyFireUtcMs(12, 0);
    const tAfternoon = nextNyFireUtcMs(16, 0);
    const tLate = nextNyFireUtcMs(22, 30);
    const noonDateKey = computeFeedViewingFromNow(tNoon).viewingChallengeDateKey;
    const afternoonDateKey = computeFeedViewingFromNow(tAfternoon).viewingChallengeDateKey;
    const lateDateKey = computeFeedViewingFromNow(tLate).viewingChallengeDateKey;
    const [noonPrompt, afternoonPostedCount, latePrompt] = await Promise.all([
      resolveChallengePrompt(noonDateKey),
      resolvePostedCount(afternoonDateKey, tAfternoon),
      resolveChallengePrompt(lateDateKey),
    ]);

    await Notifications.scheduleNotificationAsync({
      content: leapLiveNotificationContent(noonPrompt),
      trigger: dateTriggerAtUtcMs(tNoon),
    });

    await Notifications.scheduleNotificationAsync({
      content: afternoonLeapNotificationContent(afternoonPostedCount),
      trigger: dateTriggerAtUtcMs(tAfternoon),
    });

    await Notifications.scheduleNotificationAsync({
      content: streakReminderNotificationContent(latePrompt),
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
  await syncLeapScheduledNotifications({ masterEnabled: true, streakReminders: true, hasPostedToday: false });
}

import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const PROGRESS_ID = 'leap.bestPart.upload.progress';
const COMPLETE_ID = 'leap.bestPart.upload.complete';
const FAILED_ID = 'leap.bestPart.upload.failed';
const ANDROID_CHANNEL_ID = 'leap-uploads';

let channelReady = false;
let lastProgressBucket = -1;

/** In-app progress uses the top bar — skip system notifications while foregrounded. */
function isAppInForeground(): boolean {
  return AppState.currentState === 'active';
}

async function ensureAndroidUploadChannel() {
  if (Platform.OS !== 'android' || channelReady) return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Uploads',
    importance: Notifications.AndroidImportance.HIGH,
    enableVibrate: false,
    showBadge: false,
  });
  channelReady = true;
}

async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return next.granted === true;
}

function androidContentExtras() {
  if (Platform.OS !== 'android') return {};
  // Expo accepts channelId on Android content at runtime.
  return { channelId: ANDROID_CHANNEL_ID };
}

/** Present (or replace) the ongoing upload progress notification. */
export async function notifyBestPartUploadProgress(
  progress: number,
  phase: 'uploading' | 'saving'
): Promise<void> {
  try {
    if (isAppInForeground()) {
      // Keep the sticky Android/progress id from lingering if user returns to app.
      await clearBestPartUploadProgressNotification();
      return;
    }
    if (!(await ensureNotificationPermission())) return;
    await ensureAndroidUploadChannel();

    const pct = Math.max(0, Math.min(100, Math.round(progress)));
    // Throttle body churn — update every 10% or on phase change to "saving".
    const bucket = phase === 'saving' ? 101 : Math.floor(pct / 10);
    if (bucket === lastProgressBucket && phase === 'uploading') return;
    lastProgressBucket = bucket;

    const body =
      phase === 'saving'
        ? 'Almost done — saving your moment…'
        : pct > 0
          ? `${pct}% complete`
          : 'Starting upload…';

    await Notifications.scheduleNotificationAsync({
      identifier: PROGRESS_ID,
      content: {
        title: 'Uploading today’s moment',
        body,
        sound: false,
        sticky: Platform.OS === 'android',
        interruptionLevel: 'timeSensitive',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { kind: 'bestPartUpload', phase, progress: pct },
        ...androidContentExtras(),
      },
      trigger: null,
    });
  } catch {
    /* notifications are best-effort */
  }
}

export async function clearBestPartUploadProgressNotification(): Promise<void> {
  lastProgressBucket = -1;
  try {
    await Notifications.dismissNotificationAsync(PROGRESS_ID);
  } catch {
    /* ignore */
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(PROGRESS_ID);
  } catch {
    /* ignore */
  }
}

/** Time-sensitive completion ping when the Best Part finishes posting. */
export async function notifyBestPartUploadComplete(): Promise<void> {
  try {
    await clearBestPartUploadProgressNotification();
    if (isAppInForeground()) return;
    if (!(await ensureNotificationPermission())) return;
    await ensureAndroidUploadChannel();

    await Notifications.scheduleNotificationAsync({
      identifier: COMPLETE_ID,
      content: {
        title: 'Moment posted',
        body: 'Your best part of the day is live.',
        sound: true,
        sticky: false,
        interruptionLevel: 'timeSensitive',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { kind: 'bestPartUploadComplete' },
        ...androidContentExtras(),
      },
      trigger: null,
    });
  } catch {
    /* best-effort */
  }
}

export async function notifyBestPartUploadFailed(message?: string): Promise<void> {
  try {
    await clearBestPartUploadProgressNotification();
    if (isAppInForeground()) return;
    if (!(await ensureNotificationPermission())) return;
    await ensureAndroidUploadChannel();

    await Notifications.scheduleNotificationAsync({
      identifier: FAILED_ID,
      content: {
        title: 'Moment failed to post',
        body: message?.trim() || 'Tap Leap to retry.',
        sound: true,
        sticky: false,
        interruptionLevel: 'timeSensitive',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { kind: 'bestPartUploadFailed' },
        ...androidContentExtras(),
      },
      trigger: null,
    });
  } catch {
    /* best-effort */
  }
}

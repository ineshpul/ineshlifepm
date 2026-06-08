import AsyncStorage from '@react-native-async-storage/async-storage';

const PROMPTED_PREFIX = 'leap.appReviewPrompted.v1';
const SNOOZE_PREFIX = 'leap.appReviewSnoozeUntil.v1';

/** Wait until after the referral intro before asking for a review. */
const MIN_CHALLENGES_COMPLETED = 3;
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function promptedKey(uid: string) {
  return `${PROMPTED_PREFIX}.${uid}`;
}

function snoozeKey(uid: string) {
  return `${SNOOZE_PREFIX}.${uid}`;
}

export async function hasCompletedAppReviewPrompt(uid: string): Promise<boolean> {
  if (!uid) return false;
  return (await AsyncStorage.getItem(promptedKey(uid))) === '1';
}

export async function markAppReviewPromptCompleted(uid: string): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(promptedKey(uid), '1');
  await AsyncStorage.removeItem(snoozeKey(uid));
}

export async function snoozeAppReviewPrompt(uid: string): Promise<void> {
  if (!uid) return;
  await AsyncStorage.setItem(snoozeKey(uid), String(Date.now() + SNOOZE_MS));
}

async function isAppReviewSnoozed(uid: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(snoozeKey(uid));
  if (!raw) return false;
  const until = Number(raw);
  if (!Number.isFinite(until) || until <= Date.now()) {
    await AsyncStorage.removeItem(snoozeKey(uid));
    return false;
  }
  return true;
}

export async function shouldShowAppReviewPrompt(args: {
  uid: string;
  challengesCompleted: number;
  referralIntroSeen: boolean;
}): Promise<boolean> {
  const { uid, challengesCompleted, referralIntroSeen } = args;
  if (!uid || !referralIntroSeen) return false;
  if (challengesCompleted < MIN_CHALLENGES_COMPLETED) return false;
  if (await hasCompletedAppReviewPrompt(uid)) return false;
  if (await isAppReviewSnoozed(uid)) return false;
  return true;
}

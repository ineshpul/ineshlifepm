import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

const DEVICE_ID_KEY = 'leap.push.deviceId';

function expoProjectId(): string | undefined {
  const e: any = Constants.expoConfig?.extra;
  const id = e?.eas?.projectId ?? (Constants as any).easConfig?.projectId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

async function getOrCreateDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `d_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

/**
 * Registers for remote push (Expo) and saves the token under
 * `users/{uid}/pushDevices/{deviceId}` for Cloud Functions to target.
 */
export async function registerAndSavePushToken(uid: string): Promise<void> {
  if (!isFirebaseConfigured() || !uid) return;
  if (!Device.isDevice) return;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const projectId = expoProjectId();
  let tokenData: Notifications.ExpoPushToken | null = null;
  try {
    tokenData = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
  } catch {
    return;
  }
  const token = tokenData.data;
  if (!token) return;

  const deviceId = await getOrCreateDeviceId();
  await setDoc(
    doc(firestore(), 'users', uid, 'pushDevices', deviceId),
    {
      token,
      platform: Platform.OS,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Removes this device’s Expo token so pushes are not sent after sign-out or when notifications are off. */
export async function unregisterPushDevice(uid: string): Promise<void> {
  if (!isFirebaseConfigured() || !uid) return;
  try {
    const deviceId = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) return;
    await deleteDoc(doc(firestore(), 'users', uid, 'pushDevices', deviceId));
  } catch {
    // doc may not exist
  }
}

/** Syncs the iOS home-screen badge (no-op on platforms that ignore it). */
export async function setAppBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(Math.max(0, Math.min(999, Math.floor(count))));
  } catch {
    // ignored
  }
}

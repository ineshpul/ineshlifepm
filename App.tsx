import * as React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NativeAnalyticsSync } from './src/components/NativeAnalyticsSync';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/state/auth';
import { AppStateProvider } from './src/state/appState';
import { SettingsPreferencesProvider, useSettingsPreferences } from './src/state/settingsPreferences';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { initAppCheck } from './src/firebase/appCheck';
import { firestore, isFirebaseConfigured } from './src/firebase/firebase';
import {
  privacyPatchFromPreferences,
  syncPrivacySettingsToFirestore,
} from './src/services/userPrivacySettings';
import { registerAndSavePushToken, unregisterPushDevice } from './src/services/pushNotifications';
import { getForegroundChatConversationId } from './src/chat/activeConversationRef';

/** Foreground: show remote pushes unless the user is already in that chat thread. */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    const cid = typeof data?.conversationId === 'string' ? data.conversationId : undefined;
    if (cid && cid === getForegroundChatConversationId()) {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: true,
      };
    }
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

/** Keeps Firestore in sync so Cloud Functions know whether to send pushes. */
function UserNotificationPrefSync() {
  const { user } = useAuth();
  const { preferences, ready } = useSettingsPreferences();

  React.useEffect(() => {
    if (!ready || !user?.uid || !isFirebaseConfigured()) return;
    // `updateDoc` throws if the public profile doc does not exist yet (races right after sign-in).
    void updateDoc(doc(firestore(), 'users', user.uid), {
      notificationsEnabled: preferences.notificationsEnabled,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      // ignore — profile doc may still be creating from auth `syncUserProfileDocs`
    });
  }, [ready, user?.uid, preferences.notificationsEnabled]);

  React.useEffect(() => {
    if (!ready || !user?.uid || !isFirebaseConfigured()) return;
    const privacy = privacyPatchFromPreferences(preferences);
    if (!privacy) return;
    void syncPrivacySettingsToFirestore(user.uid, privacy);
  }, [
    ready,
    user?.uid,
    preferences.privateAccount,
    preferences.whoCanComment,
    preferences.whoCanMessage,
    preferences.activityStatus,
    preferences.showStreakPublic,
    preferences.showScorePublic,
  ]);

  return null;
}

/** Registers Expo push token and stores it under `users/{uid}/pushDevices/{deviceId}`. */
function PushTokenRegistrar() {
  const { user } = useAuth();
  const { preferences, ready } = useSettingsPreferences();

  React.useEffect(() => {
    if (!ready || !user?.uid) return;
    if (!isFirebaseConfigured()) return;
    if (!preferences.notificationsEnabled) {
      void unregisterPushDevice(user.uid);
      return;
    }
    void registerAndSavePushToken(user.uid);
  }, [ready, user?.uid, preferences.notificationsEnabled]);

  return null;
}

export default function App() {
  React.useEffect(() => {
    void initAppCheck();
  }, []);

  React.useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <SettingsPreferencesProvider>
            <NativeAnalyticsSync />
            <UserNotificationPrefSync />
            <PushTokenRegistrar />
            <AppStateProvider>
              <RootNavigator />
              <StatusBar style="dark" />
            </AppStateProvider>
          </SettingsPreferencesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

import * as React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useChatInboxLocalNotifications } from './src/chat/hooks/useChatInboxLocalNotifications';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/state/auth';
import { AppStateProvider } from './src/state/appState';
import { SettingsPreferencesProvider, useSettingsPreferences } from './src/state/settingsPreferences';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './src/firebase/firebase';
import { registerAndSavePushToken, unregisterPushDevice } from './src/services/pushNotifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Foreground: local banner when inbox unread increases (remote push still handles background). */
function ChatInboxNotificationSubscriber() {
  const { user } = useAuth();
  const { preferences, ready } = useSettingsPreferences();
  useChatInboxLocalNotifications(user?.uid, ready && preferences.notificationsEnabled);
  return null;
}

/** Keeps Firestore in sync so Cloud Functions know whether to send pushes. */
function UserNotificationPrefSync() {
  const { user } = useAuth();
  const { preferences, ready } = useSettingsPreferences();

  React.useEffect(() => {
    if (!ready || !user?.uid || !isFirebaseConfigured()) return;
    void updateDoc(doc(firestore(), 'users', user.uid), {
      notificationsEnabled: preferences.notificationsEnabled,
      chatMessageAudience: preferences.whoCanMessage,
      updatedAt: serverTimestamp(),
    });
  }, [ready, user?.uid, preferences.notificationsEnabled, preferences.whoCanMessage]);

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
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SettingsPreferencesProvider>
          <UserNotificationPrefSync />
          <PushTokenRegistrar />
          <ChatInboxNotificationSubscriber />
          <AppStateProvider>
            <RootNavigator />
            <StatusBar style="dark" />
          </AppStateProvider>
        </SettingsPreferencesProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

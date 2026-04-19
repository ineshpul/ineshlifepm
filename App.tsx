import * as React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Audio } from 'expo-av';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { RootNavigator } from './src/navigation/RootNavigator';
import { AuthProvider, useAuth } from './src/state/auth';
import { AppStateProvider } from './src/state/appState';
import { SettingsPreferencesProvider, useSettingsPreferences } from './src/state/settingsPreferences';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { firestore, isFirebaseConfigured } from './src/firebase/firebase';
import { registerAndSavePushToken, unregisterPushDevice } from './src/services/pushNotifications';

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
          <AppStateProvider>
            <RootNavigator />
            <StatusBar style="dark" />
          </AppStateProvider>
        </SettingsPreferencesProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

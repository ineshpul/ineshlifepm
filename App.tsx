import * as Updates from 'expo-updates';
import * as React from 'react';
import { AppState } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NativeAnalyticsSync } from './src/components/NativeAnalyticsSync';
import { RootNavigator } from './src/navigation/RootNavigator';

const ChallengeWatermarkCaptureHost = React.lazy(() =>
  import('./src/services/challengeWatermarkCapture').then((mod) => ({
    default: mod.ChallengeWatermarkCaptureHost,
  }))
);
import { AuthProvider, useAuth } from './src/state/auth';
import { AppStateProvider } from './src/state/appState';
import { BackgroundPostUploadProvider } from './src/state/backgroundPostUpload';
import { SettingsPreferencesProvider, useSettingsPreferences } from './src/state/settingsPreferences';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { initAppCheck } from './src/firebase/appCheck';
import { firestore, isFirebaseConfigured } from './src/firebase/firebase';
import {
  privacyPatchFromPreferences,
  syncPrivacySettingsToFirestore,
} from './src/services/userPrivacySettings';
import { registerAndSavePushToken, unregisterPushDevice } from './src/services/pushNotifications';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { getForegroundChatConversationId } from './src/chat/activeConversationRef';
import { prefetchTodayChallengeCache } from './src/state/challengeCache';

prefetchTodayChallengeCache();

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
      streakReminders: preferences.streakReminders,
      updatedAt: serverTimestamp(),
    }).catch(() => {
      // ignore — profile doc may still be creating from auth `syncUserProfileDocs`
    });
  }, [ready, user?.uid, preferences.notificationsEnabled, preferences.streakReminders]);

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

/** Fetch and apply EAS updates on launch and when returning to foreground. */
function OtaUpdateOnLaunch() {
  const applyPendingUpdate = React.useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      }
    } catch {
      // Offline, dev client, or update server unreachable — keep running embedded bundle.
    }
  }, []);

  React.useEffect(() => {
    void applyPendingUpdate();
  }, [applyPendingUpdate]);

  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void applyPendingUpdate();
    });
    return () => sub.remove();
  }, [applyPendingUpdate]);

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
            <OtaUpdateOnLaunch />
            <NativeAnalyticsSync />
            <UserNotificationPrefSync />
            <PushTokenRegistrar />
            <AppStateProvider>
              <BackgroundPostUploadProvider>
              <ThemeProvider>
                <RootNavigator />
                <React.Suspense fallback={null}>
                  <ChallengeWatermarkCaptureHost />
                </React.Suspense>
              </ThemeProvider>
              </BackgroundPostUploadProvider>
            </AppStateProvider>
          </SettingsPreferencesProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

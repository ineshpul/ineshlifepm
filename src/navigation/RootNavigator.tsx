import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  NavigationContainer,
  createNavigationContainerRef,
  type NavigationState,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { RecordScreen } from '../screens/RecordScreen';
import { useAuth } from '../state/auth';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ChallengeAdminScreen } from '../screens/ChallengeAdminScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BlockedUsersScreen } from '../screens/BlockedUsersScreen';
import { MutedUsersScreen } from '../screens/MutedUsersScreen';
import { LegalDocumentScreen } from '../screens/LegalDocumentScreen';
import { UserProfileScreen } from '../screens/UserProfileScreen';
import { FollowingListScreen } from '../screens/FollowingListScreen';
import { VideoPostScreen } from '../screens/VideoPostScreen';
import { AdminVideoModerationScreen } from '../screens/AdminVideoModerationScreen';
import { YourLeapsScreen } from '../screens/YourLeapsScreen';
import { UserLeapsScreen } from '../screens/UserLeapsScreen';
import { TakeTheLeapForLeapsScreen } from '../screens/TakeTheLeapForLeapsScreen';
import { LEGAL_DOCS } from '../content/settingsLegal';
import type { AuthStackParamList, MainStackParamList } from './types';
import { handleNotificationNavigation } from './notificationNavigation';
import { AppTabs } from './Tabs';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';
import { TermsGateScreen } from '../screens/TermsGateScreen';
import { logNativeScreenView } from '../services/nativeAnalytics';
import { hasAcceptedTerms, subscribeTermsAcceptance } from '../state/termsAcceptance';
import { ReferralIntroHost } from '../components/ReferralIntroHost';

const MainStack = createNativeStackNavigator<MainStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export type { RootStackParamList } from './types';

const screenOptions = { headerShown: false } as const;

/** No SignIn / SignUp here — duplicate route names confused iOS native stack + Expo Go after login. */
export const rootNavigationRef = createNavigationContainerRef<MainStackParamList>();

function activeRouteName(state: NavigationState | undefined): string | undefined {
  if (!state) return undefined;
  const route = state.routes[state.index ?? 0];
  const nested = route.state as NavigationState | undefined;
  if (nested) return activeRouteName(nested);
  return route.name;
}

function LoggedInStack() {
  return (
    <MainStack.Navigator initialRouteName="Tabs" screenOptions={screenOptions}>
      <MainStack.Screen name="Tabs" component={AppTabs} />
      <MainStack.Screen
        name="Record"
        component={RecordScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'fade',
          gestureEnabled: true,
        }}
      />
      <MainStack.Screen
        name="ChallengeAdmin"
        component={ChallengeAdminScreen}
        options={{ headerShown: true, title: "Today's Leap" }}
      />
      <MainStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ headerShown: true, title: 'Notifications' }}
      />
      <MainStack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Settings' }} />
      <MainStack.Screen
        name="BlockedUsers"
        component={BlockedUsersScreen}
        options={{ headerShown: true, title: 'Blocked users' }}
      />
      <MainStack.Screen
        name="MutedUsers"
        component={MutedUsersScreen}
        options={{ headerShown: true, title: 'Muted users' }}
      />
      <MainStack.Screen
        name="LegalDocument"
        component={LegalDocumentScreen}
        options={({ route }) => ({
          headerShown: true,
          title: LEGAL_DOCS[route.params.docId].title,
        })}
      />
      <MainStack.Screen
        name="UserProfile"
        component={UserProfileScreen}
        /** New stack entry per `uid` so header params never stick from the last opened profile. */
        getId={({ params }) => params.uid}
        options={{ headerShown: true, title: 'Profile' }}
      />
      <MainStack.Screen
        name="FollowingList"
        component={FollowingListScreen}
        options={{ headerShown: true, title: 'Following' }}
      />
      <MainStack.Screen
        name="MyLeaps"
        component={YourLeapsScreen}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <MainStack.Screen
        name="UserLeaps"
        component={UserLeapsScreen}
        getId={({ params }) => params.uid}
        options={{
          headerShown: false,
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <MainStack.Screen
        name="TakeTheLeapForLeaps"
        component={TakeTheLeapForLeapsScreen}
        options={{
          headerShown: true,
          title: 'Take the Leap',
          presentation: 'card',
          animation: 'slide_from_right',
        }}
      />
      <MainStack.Screen
        name="VideoPost"
        component={VideoPostScreen}
        options={{ headerShown: true, title: 'Highest Leap' }}
      />
      <MainStack.Screen
        name="AdminVideoModeration"
        component={AdminVideoModerationScreen}
        options={{ headerShown: true, title: 'Moderate video' }}
      />
    </MainStack.Navigator>
  );
}

function LoggedOutStack() {
  return (
    <AuthStack.Navigator initialRouteName="SignUp" screenOptions={screenOptions}>
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

export function RootNavigator() {
  const { user, authReady } = useAuth();
  const authed = Boolean(user?.uid);
  const needsEmailVerification = Boolean(user?.needsEmailVerification);
  const navKey = !authReady
    ? 'auth-boot'
    : !authed
      ? 'signed-out'
      : needsEmailVerification
        ? `verify-${user!.uid}`
        : `app-${user!.uid}`;
  const [termsOk, setTermsOk] = React.useState<boolean>(false);
  const [termsReady, setTermsReady] = React.useState<boolean>(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!authed || !user?.uid) {
        if (!alive) return;
        setTermsOk(false);
        setTermsReady(false);
        return;
      }
      try {
        const ok = await hasAcceptedTerms(user.uid);
        if (!alive) return;
        setTermsOk(ok);
      } finally {
        if (alive) setTermsReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [authed, user?.uid]);

  React.useEffect(() => {
    if (!authed || !user?.uid) return;
    return subscribeTermsAcceptance((uid, accepted) => {
      if (uid !== user.uid) return;
      setTermsOk(accepted);
      setTermsReady(true);
    });
  }, [authed, user?.uid]);

  React.useEffect(() => {
    if (!authed) return;
    const open = (response: Notifications.NotificationResponse) => {
      void handleNotificationNavigation(rootNavigationRef, response);
    };
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) void handleNotificationNavigation(rootNavigationRef, r);
    });
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [authed]);

  const onNavStateChange = React.useCallback((state: NavigationState | undefined) => {
    const name = activeRouteName(state);
    if (name) void logNativeScreenView(name);
  }, []);

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f8f6' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer ref={rootNavigationRef} key={navKey} onStateChange={onNavStateChange}>
      {authed && needsEmailVerification ? (
        <VerifyEmailScreen />
      ) : authed && termsReady && !termsOk ? (
        <TermsGateScreen />
      ) : authed ? (
        <>
          <LoggedInStack />
          {termsOk ? <ReferralIntroHost /> : null}
        </>
      ) : (
        <LoggedOutStack />
      )}
    </NavigationContainer>
  );
}

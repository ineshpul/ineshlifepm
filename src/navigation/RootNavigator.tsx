import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

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
import { VideoPostScreen } from '../screens/VideoPostScreen';
import { AdminVideoModerationScreen } from '../screens/AdminVideoModerationScreen';
import { LEGAL_DOCS } from '../content/settingsLegal';
import type { AuthStackParamList, MainStackParamList, RootStackParamList } from './types';
import { AppTabs } from './Tabs';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

const MainStack = createNativeStackNavigator<MainStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

export type { RootStackParamList } from './types';

const screenOptions = { headerShown: false } as const;

/** No SignIn / SignUp here — duplicate route names confused iOS native stack + Expo Go after login. */
function LoggedInStack() {
  return (
    <MainStack.Navigator initialRouteName="Tabs" screenOptions={screenOptions}>
      <MainStack.Screen name="Tabs" component={AppTabs} />
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
        options={({ route }) => ({
          headerShown: true,
          title: route.params.username ? `@${route.params.username}` : 'Profile',
        })}
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
  const { user } = useAuth();
  const authed = Boolean(user?.uid);
  const needsEmailVerification = Boolean(user?.needsEmailVerification);
  const navKey = !authed ? 'signed-out' : needsEmailVerification ? `verify-${user!.uid}` : `app-${user!.uid}`;

  return (
    <NavigationContainer key={navKey}>
      {authed && needsEmailVerification ? (
        <VerifyEmailScreen />
      ) : authed ? (
        <LoggedInStack />
      ) : (
        <LoggedOutStack />
      )}
    </NavigationContainer>
  );
}

import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../state/auth';
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
import type { RootStackParamList } from './types';
import { AppTabs } from './Tabs';

const Stack = createNativeStackNavigator<RootStackParamList>();

export type { RootStackParamList } from './types';

export function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={AppTabs} />
            <Stack.Screen
              name="ChallengeAdmin"
              component={ChallengeAdminScreen}
              options={{ headerShown: true, title: "Today's Leap" }}
            />
            <Stack.Screen
              name="Notifications"
              component={NotificationsScreen}
              options={{ headerShown: true, title: 'Notifications' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ headerShown: true, title: 'Settings' }}
            />
            <Stack.Screen
              name="BlockedUsers"
              component={BlockedUsersScreen}
              options={{ headerShown: true, title: 'Blocked users' }}
            />
            <Stack.Screen
              name="MutedUsers"
              component={MutedUsersScreen}
              options={{ headerShown: true, title: 'Muted users' }}
            />
            <Stack.Screen
              name="LegalDocument"
              component={LegalDocumentScreen}
              options={({ route }) => ({
                headerShown: true,
                title: LEGAL_DOCS[route.params.docId].title,
              })}
            />
            <Stack.Screen
              name="UserProfile"
              component={UserProfileScreen}
              options={({ route }) => ({
                headerShown: true,
                title: route.params.username ? `@${route.params.username}` : 'Profile',
              })}
            />
            <Stack.Screen
              name="VideoPost"
              component={VideoPostScreen}
              options={{ headerShown: true, title: 'Highest Leap' }}
            />
            <Stack.Screen
              name="AdminVideoModeration"
              component={AdminVideoModerationScreen}
              options={{ headerShown: true, title: 'Moderate video' }}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="SignUp" component={SignUpScreen} />
            <Stack.Screen name="SignIn" component={SignInScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}


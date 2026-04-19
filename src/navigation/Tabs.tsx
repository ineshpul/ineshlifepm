import * as React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { TodayScreen } from '../screens/TodayScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { RecordScreen } from '../screens/RecordScreen';
import { TopScreen } from '../screens/TopScreen';
import { MeScreen } from '../screens/MeScreen';
import { ChatStackNavigator } from './ChatStack';

export type TabsParamList = {
  Today: undefined;
  Feed: undefined;
  Record: undefined;
  Top: undefined;
  Chat: undefined;
  Me: undefined;
};

const Tab = createBottomTabNavigator<TabsParamList>();

function TabIcon({
  name,
  focused,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
}) {
  return (
    <View style={[styles.iconWrap, focused && styles.iconWrapFocused]}>
      <Ionicons name={name} size={20} color={focused ? colors.coral : colors.muted} />
    </View>
  );
}

export function AppTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: 'Today',
          tabBarIcon: ({ focused }) => <TabIcon name="today-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          title: 'Feed',
          tabBarAccessibilityLabel: 'Feed',
          tabBarIcon: ({ focused }) => <TabIcon name="albums-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Record"
        component={RecordScreen}
        options={{
          title: 'Record',
          tabBarAccessibilityLabel: 'Record',
          tabBarIcon: ({ focused }) => <TabIcon name="videocam-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Top"
        component={TopScreen}
        options={{
          title: 'How high can you jump?',
          tabBarAccessibilityLabel: 'How high can you jump? Leaderboard',
          tabBarIcon: ({ focused }) => <TabIcon name="trending-up-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{
          title: 'Chat',
          tabBarAccessibilityLabel: 'Chat',
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubbles-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeScreen}
        options={{
          title: 'Me',
          tabBarAccessibilityLabel: 'Me',
          tabBarIcon: ({ focused }) => <TabIcon name="person-circle-outline" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 58,
    paddingTop: 6,
    paddingBottom: 10,
    borderTopColor: colors.border,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapFocused: {
    backgroundColor: 'rgba(255, 107, 84, 0.12)',
  },
});


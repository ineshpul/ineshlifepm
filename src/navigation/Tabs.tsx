import * as React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
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

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{label}</Text>
  );
}

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
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      <Tab.Screen
        name="Today"
        component={TodayScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="TODAY" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="today-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="FEED" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="albums-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Record"
        component={RecordScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="RECORD" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="videocam-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Top"
        component={TopScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="TOP" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="trending-up-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={ChatStackNavigator}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="CHAT" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="chatbubbles-outline" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Me"
        component={MeScreen}
        options={{
          tabBarLabel: ({ focused }) => <TabLabel label="ME" focused={focused} />,
          tabBarIcon: ({ focused }) => <TabIcon name="person-circle-outline" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 74,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopColor: colors.border,
  },
  tabLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '800',
    color: colors.muted,
  },
  tabLabelFocused: {
    color: colors.text,
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


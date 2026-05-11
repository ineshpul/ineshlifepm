import * as React from 'react';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../theme/colors';
import { TodayScreen } from '../screens/TodayScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { TopScreen } from '../screens/TopScreen';
import { MeScreen } from '../screens/MeScreen';
import { ChatStackNavigator } from './ChatStack';
import type { ChatStackParamList } from './ChatStack';

export type TabsParamList = {
  Today: undefined;
  /** Everyone’s leaps (gated until you post). Same reel as before; lives on the play tab. */
  Feed: undefined;
  Top: undefined;
  Chat: NavigatorScreenParams<ChatStackParamList> | undefined;
  Me: undefined;
};

const Tab = createMaterialTopTabNavigator<TabsParamList>();

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
    <View style={styles.tabsRoot}>
      <View style={styles.tabsFill}>
        <Tab.Navigator
          initialRouteName="Today"
          tabBarPosition="bottom"
          screenOptions={{
            tabBarShowLabel: false,
            tabBarShowIcon: true,
            swipeEnabled: true,
            /** Tab bar / programmatic switches jump instantly; swipes still animate (smoother after posting). */
            animationEnabled: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: colors.text,
            tabBarInactiveTintColor: colors.muted,
            tabBarIndicatorStyle: styles.tabBarIndicator,
            tabBarPressColor: 'transparent',
            tabBarPressOpacity: 0.85,
            tabBarItemStyle: styles.tabBarItem,
            tabBarContentContainerStyle: styles.tabBarContent,
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
              tabBarAccessibilityLabel: "Everyone's leaps",
              tabBarIcon: ({ focused }) => <TabIcon name="play-circle-outline" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="Top"
            component={TopScreen}
            options={{
              title: 'How high can you jump?',
              tabBarAccessibilityLabel: 'How high can you jump? Leaperboard',
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabsRoot: { flex: 1 },
  tabsFill: { flex: 1 },
  tabBar: {
    height: 58,
    paddingTop: 6,
    paddingBottom: 10,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    shadowOpacity: 0,
  },
  tabBarIndicator: {
    height: 0,
    backgroundColor: 'transparent',
  },
  tabBarItem: {
    flex: 1,
  },
  tabBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
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

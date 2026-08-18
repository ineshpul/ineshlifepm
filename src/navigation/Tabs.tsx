import * as React from 'react';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemedStyles } from '../theme/ThemeProvider';
import { TodayScreen } from '../screens/TodayScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { MeScreen } from '../screens/MeScreen';
import { ChatStackNavigator } from './ChatStack';
import type { ChatStackParamList } from './ChatStack';
import { FloatingTabBar } from './FloatingTabBar';
import { BackgroundUploadBar } from '../components/BackgroundUploadBar';
import { ChatUnreadProvider } from '../chat/ChatUnreadContext';

export type FeedTabMode = 'daily' | 'bpotd';

export type TabsParamList = {
  Today: undefined;
  /** Daily Leaps + BPOTD community — mode switch lives inside Feed. */
  Feed:
    | { mode?: FeedTabMode; initialVideoId?: string; initialBestPartId?: string }
    | undefined;
  Chat: NavigatorScreenParams<ChatStackParamList> | undefined;
  Me: undefined;
};

const Tab = createMaterialTopTabNavigator<TabsParamList>();

const TAB_ICON_SIZE = 20;

function TabIcon({
  name,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}) {
  const iconName = focused
    ? (name.replace('-outline', '') as keyof typeof Ionicons.glyphMap)
    : name;
  return <Ionicons name={iconName} size={TAB_ICON_SIZE} color={color} />;
}

export function AppTabs() {
  const styles = useThemedStyles((colors) => ({
    tabsRoot: { flex: 1, backgroundColor: colors.bg },
    tabBarHidden: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      height: 0,
      backgroundColor: 'transparent',
      borderTopWidth: 0,
      elevation: 0,
      shadowOpacity: 0,
    },
    tabBarIndicator: {
      height: 0,
      backgroundColor: 'transparent',
    },
    scene: {
      backgroundColor: colors.bg,
    },
  }));

  return (
    <ChatUnreadProvider>
    <View style={styles.tabsRoot}>
      <BackgroundUploadBar />
      <Tab.Navigator
        initialRouteName="Today"
        tabBarPosition="bottom"
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          tabBarShowLabel: false,
          tabBarShowIcon: true,
          swipeEnabled: true,
          animationEnabled: true,
          lazy: true,
          lazyPreloadDistance: 1,
          tabBarStyle: styles.tabBarHidden,
          tabBarIndicatorStyle: styles.tabBarIndicator,
          tabBarPressColor: 'transparent',
          tabBarPressOpacity: 0.85,
          sceneStyle: styles.scene,
        }}
      >
        <Tab.Screen
          name="Today"
          component={TodayScreen}
          options={{
            title: 'Today',
            tabBarAccessibilityLabel: 'Home',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon name="home-outline" focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Feed"
          component={FeedScreen}
          options={{
            title: 'Feed',
            tabBarAccessibilityLabel: "Everyone's leaps",
            tabBarIcon: ({ focused, color }) => (
              <TabIcon name="play-circle-outline" focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Chat"
          component={ChatStackNavigator}
          options={{
            title: 'Chat',
            tabBarAccessibilityLabel: 'Chat',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon name="chatbubbles-outline" focused={focused} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Me"
          component={MeScreen}
          options={{
            title: 'Me',
            tabBarAccessibilityLabel: 'Me',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon name="person-circle-outline" focused={focused} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </View>
    </ChatUnreadProvider>
  );
}

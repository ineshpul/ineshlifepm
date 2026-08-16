import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useChatUnreadCount } from '../chat/ChatUnreadContext';
import { CreatePostSheet } from '../components/modern/CreatePostSheet';
import {
  FLOATING_TAB_BOTTOM_GAP,
  FLOATING_TAB_PILL_HEIGHT,
  FLOATING_TAB_SIDE_INSET,
} from './tabBarMetrics';

const CHAT_INBOX_ROUTES = new Set(['ChatInbox']);

/** Tabs left of the centered create button (Today, Feed); Chat/Me sit to its right. */
const CREATE_BUTTON_AFTER_INDEX = 1;

export function FloatingTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, FLOATING_TAB_BOTTOM_GAP);
  const { colors } = useTheme();
  const chatUnread = useChatUnreadCount();
  const [createOpen, setCreateOpen] = React.useState(false);

  const styles = useThemedStyles((c) => ({
    host: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center' as const,
      paddingHorizontal: FLOATING_TAB_SIDE_INSET,
    },
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      width: '100%',
      maxWidth: 420,
      height: FLOATING_TAB_PILL_HEIGHT,
      paddingHorizontal: 6,
      borderRadius: 24,
      backgroundColor: c.tabBarPill,
      borderWidth: 1,
      borderColor: c.border2,
      ...Platform.select({
        ios: {
          shadowColor: '#102818',
          shadowOpacity: 0.22,
          shadowRadius: 17,
          shadowOffset: { width: 0, height: 9 },
        },
        android: {
          elevation: 10,
        },
        default: {},
      }),
    },
    group: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
    },
    tab: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: 44,
    },
    tabPressed: {
      opacity: 0.82,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    iconWrapFocused: {
      backgroundColor: c.cardTint,
    },
    createSlot: {
      width: 58,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    createBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.green,
      ...Platform.select({
        ios: {
          shadowColor: c.green,
          shadowOpacity: 0.55,
          shadowRadius: 13,
          shadowOffset: { width: 0, height: 8 },
        },
        android: {
          elevation: 8,
        },
        default: {},
      }),
    },
    createPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.96 }],
    },
    badge: {
      position: 'absolute' as const,
      top: 0,
      right: 0,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: c.coral,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    badgeTxt: { color: c.white, fontSize: 9, fontWeight: '900' as const },
  }));

  const focusedRoute = state.routes[state.index];
  const nestedName =
    focusedRoute?.name === 'Chat'
      ? getFocusedRouteNameFromRoute(focusedRoute) ?? 'ChatInbox'
      : null;
  const hideTabBar =
    focusedRoute?.name === 'Chat' && nestedName != null && !CHAT_INBOX_ROUTES.has(nestedName);

  if (hideTabBar) {
    return null;
  }

  const renderTab = (route: (typeof state.routes)[number], index: number) => {
    const { options } = descriptors[route.key];
    const isFocused = state.index === index;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!isFocused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };

    const onLongPress = () => {
      navigation.emit({
        type: 'tabLongPress',
        target: route.key,
      });
    };

    const icon = options.tabBarIcon?.({
      focused: isFocused,
      color: isFocused ? colors.green : colors.muted2,
    });

    const showBadge = route.name === 'Chat' && chatUnread > 0;
    const label = options.tabBarAccessibilityLabel ?? options.title ?? route.name;

    return (
      <Pressable
        key={route.key}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityState={isFocused ? { selected: true } : {}}
        accessibilityLabel={label}
        style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
      >
        <View style={[styles.iconWrap, isFocused && styles.iconWrapFocused]}>
          {icon}
          {showBadge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{chatUnread > 99 ? '99+' : chatUnread}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    );
  };

  const tabs = state.routes.map(renderTab);

  return (
    <>
      <View pointerEvents="box-none" style={[styles.host, { paddingBottom: bottom }]}>
        <View style={styles.pill}>
          <View style={styles.group}>{tabs.slice(0, CREATE_BUTTON_AFTER_INDEX + 1)}</View>
          <View style={styles.createSlot}>
            <Pressable
              onPress={() => setCreateOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Create a post"
              accessibilityHint="Opens Today's Leap, Best Part Of Your Day and leap suggestions"
              style={({ pressed }) => [styles.createBtn, pressed && styles.createPressed]}
            >
              <Ionicons name="add" size={27} color={colors.white} />
            </Pressable>
          </View>
          <View style={styles.group}>{tabs.slice(CREATE_BUTTON_AFTER_INDEX + 1)}</View>
        </View>
      </View>

      <CreatePostSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}

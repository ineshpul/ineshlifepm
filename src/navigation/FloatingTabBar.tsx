import * as React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import type { MaterialTopTabBarProps } from '@react-navigation/material-top-tabs';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { useChatUnreadCount } from '../chat/ChatUnreadContext';
import {
  FLOATING_TAB_BOTTOM_GAP,
  FLOATING_TAB_PILL_HEIGHT,
  FLOATING_TAB_SIDE_INSET,
} from './tabBarMetrics';

const CHAT_INBOX_ROUTES = new Set(['ChatInbox']);

export function FloatingTabBar({ state, descriptors, navigation }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, FLOATING_TAB_BOTTOM_GAP);
  const { colors } = useTheme();
  const chatUnread = useChatUnreadCount();
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
      justifyContent: 'space-between' as const,
      width: '100%',
      maxWidth: 420,
      height: FLOATING_TAB_PILL_HEIGHT,
      paddingHorizontal: 10,
      borderRadius: FLOATING_TAB_PILL_HEIGHT / 2,
      backgroundColor: c.tabBarPill,
      borderWidth: 1,
      borderColor: c.border,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        },
        android: {
          elevation: 6,
        },
        default: {},
      }),
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
      borderRadius: 18,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    iconWrapFocused: {
      backgroundColor: c.cardTint,
    },
    badge: {
      position: 'absolute' as const,
      top: 2,
      right: 2,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 4,
      backgroundColor: c.moss,
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
  const hideTabBar = focusedRoute?.name === 'Chat' && nestedName != null && !CHAT_INBOX_ROUTES.has(nestedName);

  if (hideTabBar) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={[styles.host, { paddingBottom: bottom }]}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
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

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
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
        })}
      </View>
    </View>
  );
}

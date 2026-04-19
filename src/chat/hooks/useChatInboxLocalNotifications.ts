import * as React from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import { isFirebaseConfigured } from '../../firebase/firebase';
import { subscribeMyInboxRows, type InboxMemberSnapshot } from '../../services/chat/chatFirestore';

const lastLocalByConvMs = new Map<string, number>();
const DEBOUNCE_MS = 4000;

/**
 * When the app is in the foreground, shows a local notification when a conversation’s
 * unread count increases (new text / share / attachment). Remote pushes still handle background.
 */
export function useChatInboxLocalNotifications(myUid: string | undefined, masterNotificationsOn: boolean) {
  const prevUnreadRef = React.useRef<Map<string, number>>(new Map());
  const primedRef = React.useRef(false);

  React.useEffect(() => {
    if (!masterNotificationsOn || !myUid || !isFirebaseConfigured()) {
      prevUnreadRef.current = new Map();
      primedRef.current = false;
      return;
    }

    const unsub = subscribeMyInboxRows(
      myUid,
      (rows: InboxMemberSnapshot[]) => {
        const nextMap = new Map<string, number>();
        for (const r of rows) {
          nextMap.set(r.conversationId, r.member.unreadCount);
        }

        if (!primedRef.current) {
          primedRef.current = true;
          prevUnreadRef.current = nextMap;
          return;
        }

        if (AppState.currentState !== 'active') {
          prevUnreadRef.current = nextMap;
          return;
        }

        for (const r of rows) {
          if (r.member.archived || r.member.muted) continue;
          if (r.member.chatNotificationsEnabled === false) continue;

          const prev = prevUnreadRef.current.get(r.conversationId) ?? 0;
          const next = r.member.unreadCount;
          if (next <= prev) continue;

          const now = Date.now();
          const last = lastLocalByConvMs.get(r.conversationId) ?? 0;
          if (now - last < DEBOUNCE_MS) continue;
          lastLocalByConvMs.set(r.conversationId, now);

          const title = r.member.convTitle?.trim() || 'Chat';
          const body =
            r.member.lastMessagePreview?.trim() ||
            (next - prev > 1 ? `${next - prev} new messages` : 'New message');

          void Notifications.scheduleNotificationAsync({
            content: {
              title,
              body: body.slice(0, 160),
              data: { conversationId: r.conversationId },
            },
            trigger: null,
          });
        }

        prevUnreadRef.current = nextMap;
      },
      () => {}
    );

    return () => {
      unsub();
      primedRef.current = false;
      prevUnreadRef.current = new Map();
    };
  }, [myUid, masterNotificationsOn]);
}

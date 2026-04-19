import * as React from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { ChatStackParamList } from '../../navigation/ChatStack';

/**
 * Handles notification taps that include `data.conversationId` (from Cloud Function push).
 */
export function useChatNotifications() {
  const nav = useNavigation<NativeStackNavigationProp<ChatStackParamList>>();

  React.useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const cid = res.notification.request.content.data?.conversationId;
      if (typeof cid === 'string' && cid.length > 0) {
        nav.navigate('Conversation', { conversationId: cid });
      }
    });
    void Notifications.getLastNotificationResponseAsync().then((res) => {
      const cid = res?.notification.request.content.data?.conversationId;
      if (typeof cid === 'string' && cid.length > 0) {
        nav.navigate('Conversation', { conversationId: cid });
      }
    });
    return () => sub.remove();
  }, [nav]);
}

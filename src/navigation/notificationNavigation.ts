import type * as Notifications from 'expo-notifications';
import type { NavigationContainerRef } from '@react-navigation/native';

import { firebaseAuth } from '../firebase/firebase';
import { countUnreadNotifications, markNotificationRead } from '../services/social';
import { setAppBadgeCount } from '../services/pushNotifications';
import type { MainStackParamList } from './types';

function str(d: Record<string, unknown> | undefined, key: string): string {
  const v = d?.[key];
  return typeof v === 'string' ? v : '';
}

export async function handleNotificationNavigation(
  ref: NavigationContainerRef<MainStackParamList>,
  response: Notifications.NotificationResponse
): Promise<void> {
  if (!ref.isReady()) return;
  const raw = response.notification.request.content.data as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') return;

  const uid = firebaseAuth().currentUser?.uid;
  const notificationId = str(raw, 'notificationId');
  const kind = str(raw, 'kind');
  const type = str(raw, 'type');
  if (uid && notificationId && (kind === 'social' || type === 'like' || type === 'comment' || type === 'follow')) {
    try {
      await markNotificationRead(uid, notificationId);
      const unread = await countUnreadNotifications(uid);
      await setAppBadgeCount(unread);
    } catch {
      // ignore
    }
  }

  const conversationId = str(raw, 'conversationId');
  if (conversationId) {
    ref.navigate('Tabs', {
      screen: 'Chat',
      params: {
        screen: 'Conversation',
        params: { conversationId, threadTitle: str(raw, 'threadTitle') || undefined },
      },
    });
    return;
  }

  const fromUid = str(raw, 'fromUid');
  const fromUsername = str(raw, 'fromUsername');
  const videoId = str(raw, 'videoId');

  if (kind === 'social' || type === 'like' || type === 'comment' || type === 'follow') {
    if (type === 'follow' && fromUid) {
      ref.navigate('UserProfile', { uid: fromUid, username: fromUsername || undefined });
      return;
    }
    if ((type === 'like' || type === 'comment') && videoId) {
      ref.navigate('VideoPost', { videoId });
      return;
    }
  }
}

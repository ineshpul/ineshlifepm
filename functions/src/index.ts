import * as logger from 'firebase-functions/logger';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';

import { sendLoginOtp, verifyLoginOtp } from './loginOtp';
import {
  onVerticalScoreCommentWrite,
  onVerticalScoreLikeWrite,
  onVerticalScoreVideoCreated,
  onVerticalScoreVideoDeleted,
} from './verticalScoreRecompute';
import { recomputeVerticalScoreCallable } from './verticalScoreCallable';

admin.initializeApp();

export { sendLoginOtp, verifyLoginOtp };
export {
  onVerticalScoreCommentWrite,
  onVerticalScoreLikeWrite,
  onVerticalScoreVideoCreated,
  onVerticalScoreVideoDeleted,
  recomputeVerticalScoreCallable,
};

type ChatMessagePayload = {
  senderId?: string;
  text?: string;
  kind?: string;
  conversationId?: string;
};

type NotifPayload = {
  type?: string;
  fromUsername?: string;
  snippet?: string | null;
};

function buildBody(data: NotifPayload): string {
  const u = String(data.fromUsername ?? 'Someone');
  if (data.type === 'like') return `@${u} liked your leap`;
  if (data.type === 'follow') return `@${u} started following you`;
  const snip = data.snippet ? `: ${String(data.snippet)}` : '';
  return `@${u} commented${snip}`;
}

/**
 * When a row is added to `users/{userId}/notifications`, send an Expo push to all
 * registered devices for that user (see client `pushDevices` writes).
 */
export const onInboxNotificationCreated = onDocumentCreated(
  {
    document: 'users/{userId}/notifications/{notifId}',
    region: 'us-central1',
  },
  async (event) => {
    const userId = event.params.userId as string;
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as NotifPayload;

    const userDoc = await admin.firestore().doc(`users/${userId}`).get();
    const prefs = userDoc.data();
    if (prefs?.notificationsEnabled === false) {
      logger.info('Skip push: notifications disabled', { userId });
      return;
    }

    const tokensSnap = await admin.firestore().collection(`users/${userId}/pushDevices`).get();
    const tokens = tokensSnap.docs.map((d) => String(d.data()?.token ?? '')).filter(Boolean);
    if (!tokens.length) {
      logger.info('No push tokens for user', { userId });
      return;
    }

    const body = buildBody(data);
    const messages = tokens.map((to) => ({
      to,
      title: 'Leap',
      body,
      sound: 'default',
      priority: 'high' as const,
    }));

    for (let i = 0; i < messages.length; i += 99) {
      const chunk = messages.slice(i, i + 99);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.error('Expo push API error', { status: res.status, text });
      }
    }
  }
);

/**
 * Push when a new chat message is created (1:1 / group). Skips sender; respects per-member mute + global notifications.
 */
export const onChatMessageCreated = onDocumentCreated(
  {
    document: 'conversations/{conversationId}/messages/{messageId}',
    region: 'us-central1',
  },
  async (event) => {
    const conversationId = event.params.conversationId as string;
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() as ChatMessagePayload;
    const senderId = String(data.senderId ?? '');
    if (!senderId) return;

    const convSnap = await admin.firestore().doc(`conversations/${conversationId}`).get();
    const memberIds = (convSnap.data()?.memberIds as string[] | undefined) ?? [];
    const targets = memberIds.filter((uid) => uid && uid !== senderId);
    if (!targets.length) return;

    const preview =
      data.kind === 'share_post'
        ? 'Shared a leap'
        : String(data.text ?? '').trim().slice(0, 120) || 'New message';

    for (const userId of targets) {
      const memberSnap = await admin
        .firestore()
        .doc(`conversations/${conversationId}/conversationMembers/${userId}`)
        .get();
      if (memberSnap.data()?.muted === true) continue;
      if (memberSnap.data()?.chatNotificationsEnabled === false) continue;

      const userDoc = await admin.firestore().doc(`users/${userId}`).get();
      if (userDoc.data()?.notificationsEnabled === false) continue;

      const tokensSnap = await admin.firestore().collection(`users/${userId}/pushDevices`).get();
      const tokens = tokensSnap.docs.map((d) => String(d.data()?.token ?? '')).filter(Boolean);
      if (!tokens.length) continue;

      const messages = tokens.map((to) => ({
        to,
        title: 'Leap · Chat',
        body: preview,
        sound: 'default' as const,
        priority: 'high' as const,
        data: { conversationId },
      }));

      for (let i = 0; i < messages.length; i += 99) {
        const chunk = messages.slice(i, i + 99);
        const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });
        if (!res.ok) {
          const text = await res.text();
          logger.error('Expo chat push error', { status: res.status, text, userId });
        }
      }
    }
  }
);

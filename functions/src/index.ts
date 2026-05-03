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
import { recordVideoViewCallable } from './recordVideoView';

admin.initializeApp();

export { sendLoginOtp, verifyLoginOtp };
export {
  onVerticalScoreCommentWrite,
  onVerticalScoreLikeWrite,
  onVerticalScoreVideoCreated,
  onVerticalScoreVideoDeleted,
  recomputeVerticalScoreCallable,
  recordVideoViewCallable,
};

type ChatMessagePayload = {
  senderId?: string;
  text?: string;
  kind?: string;
  conversationId?: string;
};

type NotifPayload = {
  type?: string;
  fromUid?: string;
  fromUsername?: string;
  snippet?: string | null;
  videoId?: string | null;
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
    const notifId = event.params.notifId as string;
    const messages = tokens.map((to) => ({
      to,
      title: 'Leap',
      body,
      sound: 'default',
      priority: 'high' as const,
      data: {
        kind: 'social',
        type: String(data.type ?? ''),
        fromUid: String(data.fromUid ?? ''),
        fromUsername: String(data.fromUsername ?? ''),
        videoId: String(data.videoId ?? ''),
        notificationId: String(notifId ?? ''),
      },
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

type VideoReportPayload = {
  reporterUid?: string;
  videoId?: string;
  videoOwnerUid?: string;
  videoOwnerUsername?: string;
  reason?: string;
};

async function adminTargets(): Promise<string[]> {
  const snap = await admin.firestore().collection('users').where('isAdmin', '==', true).limit(25).get();
  return snap.docs.map((d) => d.id).filter(Boolean);
}

async function notifyAdmins(title: string, body: string, data?: Record<string, unknown>) {
  const admins = await adminTargets();
  for (const userId of admins) {
    const tokensSnap = await admin.firestore().collection(`users/${userId}/pushDevices`).get();
    const tokens = tokensSnap.docs.map((d) => String(d.data()?.token ?? '')).filter(Boolean);
    if (!tokens.length) continue;
    const messages = tokens.map((to) => ({
      to,
      title,
      body,
      sound: 'default' as const,
      priority: 'high' as const,
      data: data ?? {},
    }));
    for (let i = 0; i < messages.length; i += 99) {
      const chunk = messages.slice(i, i + 99);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) {
        const text = await res.text();
        logger.error('Expo admin push error', { status: res.status, text, userId });
      }
    }
  }
}

/**
 * Moderation: when a video report is created, increment `videos/{id}.reportCount` and notify admins.
 * This provides:
 * - report mechanism
 * - filtering via `contentFiltering` (you can choose to hide reported posts client-side)
 * - developer notification to act within 24h
 */
export const onVideoReportCreated = onDocumentCreated(
  { document: 'videoReports/{reportId}', region: 'us-central1' },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const r = snap.data() as VideoReportPayload;
    const videoId = String(r.videoId ?? '');
    if (!videoId) return;
    try {
      await admin
        .firestore()
        .doc(`videos/${videoId}`)
        .set({ reportCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    } catch (e) {
      logger.error('Could not increment reportCount', { videoId, e });
    }
    const reporter = String(r.reporterUid ?? '');
    const owner = String(r.videoOwnerUid ?? '');
    const ownerU = String(r.videoOwnerUsername ?? 'user');
    const reason = String(r.reason ?? '').slice(0, 180);
    await notifyAdmins('Leap · Report', `Post by @${ownerU} was reported: ${reason || 'unspecified'}`, {
      type: 'video_report',
      videoId,
      reporterUid: reporter,
      ownerUid: owner,
    });
  }
);

import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';

const SYSTEM_FROM_UID = 'leap';
const SYSTEM_FROM_USERNAME = 'Leap';

export type ModerationInboxType = 'moderation_rejected' | 'mod_queue';

async function createInboxNotification(
  recipientUid: string,
  payload: {
    type: ModerationInboxType;
    snippet: string;
    videoId?: string;
  }
): Promise<void> {
  if (!recipientUid) return;
  await admin
    .firestore()
    .collection(`users/${recipientUid}/notifications`)
    .add({
      type: payload.type,
      fromUid: SYSTEM_FROM_UID,
      fromUsername: SYSTEM_FROM_USERNAME,
      videoId: payload.videoId ?? null,
      snippet: payload.snippet,
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

async function listStaffUids(db: admin.firestore.Firestore): Promise<string[]> {
  const out = new Set<string>();
  const [mods, admins] = await Promise.all([
    db.collection('users').where('isModerator', '==', true).limit(40).get(),
    db.collection('users').where('isAdmin', '==', true).limit(40).get(),
  ]);
  for (const d of mods.docs) out.add(d.id);
  for (const d of admins.docs) out.add(d.id);
  return [...out];
}

/** Notify all admins/moderators that a leap is waiting in the MOD queue. */
export async function notifyModeratorsPendingReview(args: {
  videoId: string;
  ownerUid: string;
  ownerUsername: string;
}): Promise<void> {
  const db = admin.firestore();
  const staff = await listStaffUids(db);
  if (!staff.length) {
    logger.info('No staff users to notify for pending moderation', { videoId: args.videoId });
    return;
  }
  const who = String(args.ownerUsername ?? 'user').trim() || 'user';
  const snippet = `@${who} posted a leap awaiting review`;
  await Promise.all(
    staff.map((uid) =>
      createInboxNotification(uid, {
        type: 'mod_queue',
        snippet,
        videoId: args.videoId,
      }).catch((e) => {
        logger.warn('mod_queue inbox failed', { uid, videoId: args.videoId, e });
      })
    )
  );
}

/** Tell the poster their leap was rejected and they can record again today. */
export async function notifyUserModerationRejected(args: {
  ownerUid: string;
  videoId: string;
}): Promise<void> {
  await createInboxNotification(args.ownerUid, {
    type: 'moderation_rejected',
    snippet: 'Your leap was not approved. You can post again today.',
    videoId: args.videoId,
  });
}

import * as logger from 'firebase-functions/logger';
import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

import { CALLABLE_OPTIONS, REGION } from './callableOptions';
import { coLeapCreditVideoDocId } from './postAttemptLeapVideo';
import { leapChallengeDateKeyFromMs } from './timeKeys';

export const MAX_CO_LEAP_INVITEES = 3;

export type CoLeapInviteeStatus = 'pending' | 'confirmed';

export type CoLeapInvitee = {
  uid: string;
  username: string;
  photoUrl?: string;
  status: CoLeapInviteeStatus;
  confirmedAt?: admin.firestore.Timestamp | admin.firestore.FieldValue;
  creditVideoId?: string;
};

function str(v: unknown): string {
  return String(v ?? '').trim();
}

function parseInvitees(raw: unknown): CoLeapInvitee[] {
  if (!Array.isArray(raw)) return [];
  const out: CoLeapInvitee[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const uid = str(r.uid);
    const username = str(r.username).replace(/^@+/u, '') || 'user';
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const status = str(r.status) === 'confirmed' ? 'confirmed' : 'pending';
    const photoUrl = str(r.photoUrl);
    const creditVideoId = str(r.creditVideoId);
    const invitee: CoLeapInvitee = {
      uid,
      username,
      status,
      ...(photoUrl ? { photoUrl } : {}),
      ...(creditVideoId ? { creditVideoId } : {}),
    };
    if (r.confirmedAt) {
      invitee.confirmedAt = r.confirmedAt as admin.firestore.Timestamp;
    }
    out.push(invitee);
    if (out.length >= MAX_CO_LEAP_INVITEES) break;
  }
  return out;
}

async function writeCoLeapInviteNotification(args: {
  recipientUid: string;
  fromUid: string;
  fromUsername: string;
  videoId: string;
}): Promise<void> {
  const { recipientUid, fromUid, fromUsername, videoId } = args;
  if (!recipientUid || recipientUid === fromUid) return;
  await admin.firestore().collection(`users/${recipientUid}/notifications`).add({
    type: 'co_leap_invite',
    fromUid,
    fromUsername,
    videoId,
    bestPartId: null,
    snippet: null,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/** When a leap is created with Co-Leap invitees, notify each pending invitee. */
export const onCoLeapInvitesCreated = onDocumentCreated(
  { document: 'videos/{videoId}', region: REGION },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const videoId = str(event.params.videoId);
    if (!data || !videoId) return;
    if (data.isCoLeapCredit === true) return;

    const posterUid = str(data.uid);
    const posterUsername = str(data.username) || 'user';
    if (!posterUid) return;

    const invitees = parseInvitees(data.coLeapInvitees);
    if (!invitees.length) return;

    for (const invitee of invitees) {
      if (invitee.status !== 'pending') continue;
      if (invitee.uid === posterUid) continue;
      try {
        await writeCoLeapInviteNotification({
          recipientUid: invitee.uid,
          fromUid: posterUid,
          fromUsername: posterUsername,
          videoId,
        });
      } catch (e) {
        logger.warn('co-leap invite notification failed', {
          videoId,
          inviteeUid: invitee.uid,
          e,
        });
      }
    }
  }
);

/**
 * Invitee confirms participation. Creates their day-credit video (same media / challenge)
 * so posted-today, streaks, and inches use the same path as a solo Leap.
 */
export const confirmCoLeapCallable = onCall(CALLABLE_OPTIONS, async (request) => {
  const inviteeUid = str(request.auth?.uid);
  if (!inviteeUid) throw new HttpsError('unauthenticated', 'Sign in required.');

  const videoId = str(request.data?.videoId);
  if (!videoId) throw new HttpsError('invalid-argument', 'videoId required.');

  const db = admin.firestore();
  const sourceRef = db.doc(`videos/${videoId}`);
  const nowMs = Date.now();
  const viewingDay = leapChallengeDateKeyFromMs(nowMs);

  const result = await db.runTransaction(async (tx) => {
    const sourceSnap = await tx.get(sourceRef);
    if (!sourceSnap.exists) {
      throw new HttpsError('not-found', 'That Co-Leap is no longer available.');
    }
    const source = sourceSnap.data() as Record<string, unknown>;
    if (source.isCoLeapCredit === true) {
      throw new HttpsError('invalid-argument', 'Invalid Co-Leap.');
    }
    if (source.deleted === true) {
      throw new HttpsError('failed-precondition', 'That Co-Leap was deleted.');
    }

    const mod = str(source.moderationStatus).toLowerCase();
    if (mod === 'rejected' || mod === 'nulled') {
      throw new HttpsError('failed-precondition', 'That Co-Leap is no longer available.');
    }

    const posterUid = str(source.uid);
    if (!posterUid || posterUid === inviteeUid) {
      throw new HttpsError('failed-precondition', 'You cannot confirm your own Co-Leap.');
    }

    const challengeDate = str(source.challengeDate);
    if (!challengeDate) {
      throw new HttpsError('failed-precondition', 'Invalid Co-Leap day.');
    }
    if (challengeDate !== viewingDay) {
      throw new HttpsError(
        'failed-precondition',
        'This Co-Leap invite expired when the leap day ended.'
      );
    }

    const invitees = parseInvitees(source.coLeapInvitees);
    const idx = invitees.findIndex((i) => i.uid === inviteeUid);
    if (idx < 0) {
      throw new HttpsError('permission-denied', 'You were not invited to this Co-Leap.');
    }
    if (invitees[idx]!.status === 'confirmed') {
      return {
        alreadyConfirmed: true as const,
        creditVideoId:
          invitees[idx]!.creditVideoId || coLeapCreditVideoDocId(inviteeUid, challengeDate),
        challengeDate,
        posterUid,
      };
    }

    // Separate from solo `uid_date` so confirm clears streak/day-gate but does not block own post.
    const creditId = coLeapCreditVideoDocId(inviteeUid, challengeDate);
    const creditRef = db.doc(`videos/${creditId}`);
    const creditSnap = await tx.get(creditRef);
    if (creditSnap.exists && !creditSnap.data()?.deleted) {
      const existingStatus = str(creditSnap.data()?.moderationStatus).toLowerCase();
      if (existingStatus !== 'rejected' && existingStatus !== 'nulled') {
        throw new HttpsError('failed-precondition', 'You already confirmed this Co-Leap.');
      }
    }

    const inviteeUserSnap = await tx.get(db.doc(`users/${inviteeUid}`));
    const inviteeUsername =
      str(inviteeUserSnap.data()?.username).replace(/^@+/u, '') ||
      invitees[idx]!.username ||
      'user';
    const inviteePhoto = str(inviteeUserSnap.data()?.photoUrl);

    if (creditSnap.exists) {
      tx.delete(creditRef);
    }

    const creditPayload: Record<string, unknown> = {
      uid: inviteeUid,
      username: inviteeUsername,
      ...(inviteePhoto ? { photoUrl: inviteePhoto } : {}),
      challengeDate,
      challengeTitle: str(source.challengeTitle),
      challengeSubtitle: str(source.challengeSubtitle),
      prompt: str(source.prompt) || str(source.challengeTitle),
      maxDurationSeconds: Math.max(0, Number(source.maxDurationSeconds ?? 0)),
      source: 'co_leap',
      url: str(source.url),
      storagePath: str(source.storagePath),
      moderationStatus: mod === 'approved' ? 'approved' : 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      viewCount: 0,
      likesCount: 0,
      commentsCount: 0,
      shareCount: 0,
      saveCount: 0,
      reportCount: 0,
      deleted: false,
      challengeCompleted: true,
      isCoLeapCredit: true,
      coLeapSourceVideoId: videoId,
      coLeapPosterUid: posterUid,
      coLeapPosterUsername: str(source.username) || 'user',
      hideFromFeed: true,
    };

    if (str(source.mediaType) === 'photo') {
      creditPayload.mediaType = 'photo';
    }
    const secondaryUrl = str(source.secondaryUrl);
    const secondaryStoragePath = str(source.secondaryStoragePath);
    if (secondaryUrl && secondaryStoragePath) {
      creditPayload.secondaryUrl = secondaryUrl;
      creditPayload.secondaryStoragePath = secondaryStoragePath;
      if (source.dualFrontIsPrimary === true) {
        creditPayload.dualFrontIsPrimary = true;
      }
    }
    const feedUrl = str(source.feedUrl);
    const feedSecondaryUrl = str(source.feedSecondaryUrl);
    const posterFrameUrl = str(source.posterUrl);
    if (feedUrl) creditPayload.feedUrl = feedUrl;
    if (feedSecondaryUrl) creditPayload.feedSecondaryUrl = feedSecondaryUrl;
    if (posterFrameUrl) creditPayload.posterUrl = posterFrameUrl;

    tx.set(creditRef, creditPayload);

    // Do not burn recording attempts — invitee may still post their own Leap today.

    const nextInvitees = invitees.map((inv, i) => {
      if (i !== idx) return inv;
      return {
        ...inv,
        username: inviteeUsername,
        ...(inviteePhoto ? { photoUrl: inviteePhoto } : {}),
        status: 'confirmed' as const,
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
        creditVideoId: creditId,
      };
    });

    tx.set(
      sourceRef,
      {
        coLeapInvitees: nextInvitees,
        coLeapInviteeUids: nextInvitees.map((i) => i.uid),
      },
      { merge: true }
    );

    return {
      alreadyConfirmed: false as const,
      creditVideoId: creditId,
      challengeDate,
      posterUid,
    };
  });

  if (!result.alreadyConfirmed && result.posterUid) {
    try {
      const inviteeSnap = await db.doc(`users/${inviteeUid}`).get();
      const inviteeUsername = str(inviteeSnap.data()?.username) || 'someone';
      await db.collection(`users/${result.posterUid}/notifications`).add({
        type: 'co_leap_confirmed',
        fromUid: inviteeUid,
        fromUsername: inviteeUsername,
        videoId,
        bestPartId: null,
        snippet: null,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      logger.warn('co-leap confirmed notification failed', { videoId, inviteeUid, e });
    }
  }

  return {
    alreadyConfirmed: result.alreadyConfirmed,
    creditVideoId: result.creditVideoId,
    challengeDate: result.challengeDate,
  };
});

/**
 * When the source leap is approved/rejected, mirror status onto co-leap credit docs
 * so invitees stay aligned with moderation and inch settlement.
 */
export async function syncCoLeapCreditsForSourceModeration(args: {
  db: admin.firestore.Firestore;
  sourceVideoId: string;
  sourceData: Record<string, unknown>;
  nextStatus: 'approved' | 'rejected';
}): Promise<void> {
  const { db, sourceVideoId, sourceData, nextStatus } = args;
  if (sourceData.isCoLeapCredit === true) return;
  const invitees = parseInvitees(sourceData.coLeapInvitees);
  const creditIds = invitees
    .map((i) => str(i.creditVideoId))
    .filter(Boolean);
  if (!creditIds.length) return;

  for (const creditId of creditIds) {
    const creditRef = db.doc(`videos/${creditId}`);
    try {
      const snap = await creditRef.get();
      if (!snap.exists) continue;
      const cd = snap.data() as Record<string, unknown>;
      if (cd.isCoLeapCredit !== true) continue;
      if (str(cd.coLeapSourceVideoId) !== sourceVideoId) continue;

      if (nextStatus === 'rejected') {
        await creditRef.set({ moderationStatus: 'rejected' }, { merge: true });
        // Rejection handler on the credit doc will revoke inches + delete.
        continue;
      }

      const cur = str(cd.moderationStatus).toLowerCase();
      if (cur === 'approved') continue;
      await creditRef.set({ moderationStatus: 'approved' }, { merge: true });
    } catch (e) {
      logger.warn('sync co-leap credit moderation failed', { sourceVideoId, creditId, e });
    }
  }
}

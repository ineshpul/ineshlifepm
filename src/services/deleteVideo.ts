import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';

import { firestore, storage } from '../firebase/firebase';
import { resetRecordingAttemptsAfterVideoDelete } from '../state/postAttempts';
import { syncApprovedPostCountForLeapDay } from './dailyChallengeStats';
import { scheduleVerticalScoreRecompute } from './verticalScore';

/**
 * Staff testing: remove today's leap post (if any) and restore a full attempt ledger.
 * Runs once per Record tab visit so admins/mods can re-test the post flow.
 */
export async function resetStaffLeapDayForTesting(args: { uid: string; challengeDate: string }) {
  const { uid, challengeDate } = args;
  const videoId = `${uid}_${challengeDate}`;
  const vref = doc(firestore(), 'videos', videoId);
  const snap = await getDoc(vref);
  if (snap.exists()) {
    const data = snap.data() as Record<string, unknown>;
    if (String(data.uid ?? '') === uid && data.deleted !== true) {
      await deleteOwnedVideo({ videoId, viewerUid: uid });
      return;
    }
  }
  await resetRecordingAttemptsAfterVideoDelete({ uid, challengeDate });
}

/**
 * Deletes a video the user owns: engagement subcollections, Firestore doc, Storage file,
 * and resets today's recording attempts so they can post again.
 */
export async function deleteOwnedVideo(args: { videoId: string; viewerUid: string }) {
  const { videoId, viewerUid } = args;
  const vref = doc(firestore(), 'videos', videoId);
  const snap = await getDoc(vref);
  if (!snap.exists()) {
    throw new Error('Video not found.');
  }
  const data: Record<string, unknown> = snap.data() as Record<string, unknown>;
  if (String(data.uid ?? '') !== viewerUid) {
    throw new Error('You can only delete your own videos.');
  }

  await deleteVideoByRef(vref, data, viewerUid);
}

/**
 * Same cleanup as {@link deleteOwnedVideo}, for admins/moderators deleting another user's post.
 * Firestore/Storage rules must allow `isStaff` for this path.
 */
export async function deleteStaffVideo(args: { videoId: string }) {
  const { videoId } = args;
  const vref = doc(firestore(), 'videos', videoId);
  const snap = await getDoc(vref);
  if (!snap.exists()) {
    throw new Error('Video not found.');
  }
  const data: Record<string, unknown> = snap.data() as Record<string, unknown>;
  const ownerUid = String(data.uid ?? '').trim();
  if (!ownerUid) {
    throw new Error('Invalid video owner.');
  }
  await deleteVideoByRef(vref, data, ownerUid);
}

async function deleteVideoByRef(
  vref: ReturnType<typeof doc>,
  data: Record<string, unknown>,
  ownerUidForLedger: string
) {
  const videoId = vref.id;
  const challengeDate =
    String(data.challengeDate ?? '').trim() ||
    (videoId.startsWith(`${ownerUidForLedger}_`) ? videoId.slice(ownerUidForLedger.length + 1) : '');
  const storagePath = String(data.storagePath ?? '');
  const wasApproved = String(data.moderationStatus ?? '') === 'approved';

  const likesSnap = await getDocs(
    query(collection(firestore(), 'videos', videoId, 'likes'), limit(500))
  );
  await Promise.all(likesSnap.docs.map((d) => deleteDoc(d.ref)));

  const commentsSnap = await getDocs(
    query(collection(firestore(), 'videos', videoId, 'comments'), limit(500))
  );
  await Promise.all(commentsSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(vref);

  if (challengeDate) {
    try {
      await resetRecordingAttemptsAfterVideoDelete({
        uid: ownerUidForLedger,
        challengeDate,
      });
    } catch (e) {
      // Record tab auto-heals if this fails; cloud delete trigger also resets attempts.
      if (__DEV__) console.warn('[deleteVideo] attempt ledger reset failed:', e);
    }
  }

  if (storagePath) {
    try {
      await deleteObject(ref(storage(), storagePath));
    } catch {
      // file may already be removed
    }
  }

  scheduleVerticalScoreRecompute(ownerUidForLedger);

  if (wasApproved && challengeDate) {
    void syncApprovedPostCountForLeapDay(challengeDate);
  }
}

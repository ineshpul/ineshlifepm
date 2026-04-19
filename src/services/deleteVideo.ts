import { collection, deleteDoc, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';

import { firestore, storage } from '../firebase/firebase';

/**
 * Deletes a video the user owns: engagement subcollections, Firestore doc, Storage file,
 * and today's postAttempts doc when the id matches `${uid}_${challengeDate}`.
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

  const challengeDate = String(data.challengeDate ?? '');
  const storagePath = String(data.storagePath ?? '');

  const likesSnap = await getDocs(
    query(collection(firestore(), 'videos', videoId, 'likes'), limit(500))
  );
  await Promise.all(likesSnap.docs.map((d) => deleteDoc(d.ref)));

  const commentsSnap = await getDocs(
    query(collection(firestore(), 'videos', videoId, 'comments'), limit(500))
  );
  await Promise.all(commentsSnap.docs.map((d) => deleteDoc(d.ref)));

  await deleteDoc(vref);

  if (storagePath) {
    try {
      await deleteObject(ref(storage(), storagePath));
    } catch {
      // file may already be removed
    }
  }

  if (challengeDate && videoId === `${viewerUid}_${challengeDate}`) {
    try {
      await deleteDoc(doc(firestore(), 'postAttempts', `${viewerUid}_${challengeDate}`));
    } catch {
      // optional ledger
    }
  }
}

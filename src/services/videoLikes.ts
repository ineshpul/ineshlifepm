import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { createInAppNotification } from './social';

export async function ensureVideoLiked(args: {
  videoId: string;
  viewerUid: string;
  viewerUsername: string;
  videoOwnerUid: string;
}): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;
  const { videoId, viewerUid, viewerUsername, videoOwnerUid } = args;
  if (!videoId || !viewerUid) return false;
  const likeRef = doc(firestore(), 'videos', videoId, 'likes', viewerUid);
  const snap = await getDoc(likeRef);
  if (snap.exists()) return false;
  await setDoc(likeRef, { createdAt: serverTimestamp() });
  if (viewerUid !== videoOwnerUid) {
    await createInAppNotification({
      recipientUid: videoOwnerUid,
      type: 'like',
      fromUid: viewerUid,
      fromUsername: viewerUsername,
      videoId,
    });
  }
  return true;
}

export async function toggleCommentLike(args: {
  videoId: string;
  commentId: string;
  viewerUid: string;
}): Promise<'liked' | 'unliked'> {
  if (!isFirebaseConfigured()) return 'unliked';
  const { videoId, commentId, viewerUid } = args;
  if (!videoId || !commentId || !viewerUid) return 'unliked';
  const likeRef = doc(firestore(), 'videos', videoId, 'comments', commentId, 'likes', viewerUid);
  const snap = await getDoc(likeRef);
  if (snap.exists()) {
    await deleteDoc(likeRef);
    return 'unliked';
  }
  await setDoc(likeRef, { createdAt: serverTimestamp() });
  return 'liked';
}


import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export type ToggleVideoLikeResult = {
  ok: boolean;
  liked: boolean;
  likesCount: number;
};

async function assertAuthReady(viewerUid: string): Promise<void> {
  try {
    await firebaseAuth().authStateReady();
  } catch {
    // best-effort
  }
  const cur = firebaseAuth().currentUser;
  if (!cur?.uid || cur.uid !== viewerUid) {
    throw new Error('Auth session not ready. Please try again.');
  }
}

export async function toggleVideoLike(args: {
  videoId: string;
  viewerUid: string;
  viewerUsername: string;
  liked?: boolean;
}): Promise<ToggleVideoLikeResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, liked: false, likesCount: 0 };
  }
  const { videoId, viewerUid, viewerUsername, liked } = args;
  if (!videoId || !viewerUid) {
    return { ok: false, liked: false, likesCount: 0 };
  }
  await assertAuthReady(viewerUid);
  const fn = httpsCallable<
    { videoId: string; viewerUsername: string; liked?: boolean },
    ToggleVideoLikeResult
  >(firebaseFunctions(), 'toggleVideoLikeCallable');
  const res = await fn({
    videoId,
    viewerUsername,
    ...(liked === true || liked === false ? { liked } : {}),
  });
  return res.data ?? { ok: false, liked: false, likesCount: 0 };
}

export async function ensureVideoLiked(args: {
  videoId: string;
  viewerUid: string;
  viewerUsername: string;
  videoOwnerUid: string;
}): Promise<boolean> {
  const { videoId, viewerUid, viewerUsername } = args;
  if (!videoId || !viewerUid) return false;
  const res = await toggleVideoLike({
    videoId,
    viewerUid,
    viewerUsername,
    liked: true,
  });
  return res.ok && res.liked;
}

export async function toggleCommentLike(args: {
  videoId: string;
  commentId: string;
  viewerUid: string;
}): Promise<'liked' | 'unliked'> {
  if (!isFirebaseConfigured()) return 'unliked';
  const { videoId, commentId, viewerUid } = args;
  if (!videoId || !commentId || !viewerUid) return 'unliked';
  await assertAuthReady(viewerUid);
  const { deleteDoc, doc, getDoc, serverTimestamp, setDoc } = await import('firebase/firestore');
  const { firestore } = await import('../firebase/firebase');
  const likeRef = doc(firestore(), 'videos', videoId, 'comments', commentId, 'likes', viewerUid);
  const snap = await getDoc(likeRef);
  if (snap.exists()) {
    await deleteDoc(likeRef);
    return 'unliked';
  }
  await setDoc(likeRef, { createdAt: serverTimestamp() });
  return 'liked';
}

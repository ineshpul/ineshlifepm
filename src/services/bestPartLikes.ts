import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export type ToggleBestPartLikeResult = {
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

export async function toggleBestPartLike(args: {
  bestPartId: string;
  viewerUid: string;
  viewerUsername: string;
  liked?: boolean;
}): Promise<ToggleBestPartLikeResult> {
  if (!isFirebaseConfigured()) {
    return { ok: false, liked: false, likesCount: 0 };
  }
  const { bestPartId, viewerUid, viewerUsername, liked } = args;
  if (!bestPartId || !viewerUid) {
    return { ok: false, liked: false, likesCount: 0 };
  }
  await assertAuthReady(viewerUid);
  const fn = httpsCallable<
    { bestPartId: string; viewerUsername: string; liked?: boolean },
    ToggleBestPartLikeResult
  >(firebaseFunctions(), 'toggleBestPartLikeCallable');
  const res = await fn({
    bestPartId,
    viewerUsername,
    ...(liked === true || liked === false ? { liked } : {}),
  });
  return res.data ?? { ok: false, liked: false, likesCount: 0 };
}

export async function toggleBestPartCommentLike(args: {
  bestPartId: string;
  commentId: string;
  viewerUid: string;
}): Promise<'liked' | 'unliked'> {
  if (!isFirebaseConfigured()) return 'unliked';
  const { bestPartId, commentId, viewerUid } = args;
  if (!bestPartId || !commentId || !viewerUid) return 'unliked';
  await assertAuthReady(viewerUid);
  const { deleteDoc, doc, getDoc, serverTimestamp, setDoc } = await import('firebase/firestore');
  const { firestore } = await import('../firebase/firebase');
  const likeRef = doc(
    firestore(),
    'bestParts',
    bestPartId,
    'comments',
    commentId,
    'likes',
    viewerUid
  );
  const snap = await getDoc(likeRef);
  if (snap.exists()) {
    await deleteDoc(likeRef);
    return 'unliked';
  }
  await setDoc(likeRef, { createdAt: serverTimestamp() });
  return 'liked';
}

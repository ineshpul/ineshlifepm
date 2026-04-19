import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export type NotificationType = 'like' | 'comment' | 'follow';

export type InAppNotification = {
  id: string;
  type: NotificationType;
  fromUid: string;
  fromUsername: string;
  videoId?: string;
  snippet?: string;
  read: boolean;
  createdAtMs: number;
};

/** Inbox for the signed-in user only (users/{uid}/notifications). */
export async function createInAppNotification(args: {
  recipientUid: string;
  type: NotificationType;
  fromUid: string;
  fromUsername: string;
  videoId?: string;
  snippet?: string;
}) {
  if (!isFirebaseConfigured()) return;
  const { recipientUid, type, fromUid, fromUsername, videoId, snippet } = args;
  if (!recipientUid || recipientUid === fromUid) return;
  await addDoc(collection(firestore(), 'users', recipientUid, 'notifications'), {
    type,
    fromUid,
    fromUsername,
    videoId: videoId ?? null,
    snippet: snippet ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  if (!isFirebaseConfigured()) return;
  await updateDoc(doc(firestore(), 'users', userId, 'notifications', notificationId), {
    read: true,
  });
}

export function subscribeNotifications(
  userId: string | undefined,
  onUpdate: (rows: InAppNotification[]) => void
) {
  if (!isFirebaseConfigured() || !userId) {
    onUpdate([]);
    return () => {};
  }
  const q = query(
    collection(firestore(), 'users', userId, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data: any = d.data();
          const createdAtMs =
            typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
          return {
            id: d.id,
            type: data?.type as NotificationType,
            fromUid: String(data?.fromUid ?? ''),
            fromUsername: String(data?.fromUsername ?? 'user'),
            videoId: data?.videoId != null ? String(data.videoId) : undefined,
            snippet: data?.snippet != null ? String(data.snippet) : undefined,
            read: Boolean(data?.read),
            createdAtMs,
          } satisfies InAppNotification;
        })
      );
    },
    () => onUpdate([])
  );
}

export async function followUser(opts: {
  viewerUid: string;
  targetUid: string;
  targetUsername: string;
  viewerUsername: string;
}) {
  const { viewerUid, targetUid, targetUsername, viewerUsername } = opts;
  if (!isFirebaseConfigured() || viewerUid === targetUid) return;
  await setDoc(doc(firestore(), 'users', viewerUid, 'following', targetUid), {
    targetUsername,
    createdAt: serverTimestamp(),
  });
  await createInAppNotification({
    recipientUid: targetUid,
    type: 'follow',
    fromUid: viewerUid,
    fromUsername: viewerUsername,
  });
}

export async function unfollowUser(viewerUid: string, targetUid: string) {
  if (!isFirebaseConfigured() || viewerUid === targetUid) return;
  await deleteDoc(doc(firestore(), 'users', viewerUid, 'following', targetUid));
}

export function subscribeIsFollowing(
  viewerUid: string | undefined,
  targetUid: string | undefined,
  onUpdate: (following: boolean) => void
) {
  if (!isFirebaseConfigured() || !viewerUid || !targetUid || viewerUid === targetUid) {
    onUpdate(false);
    return () => {};
  }
  const ref = doc(firestore(), 'users', viewerUid, 'following', targetUid);
  return onSnapshot(
    ref,
    (snap) => onUpdate(snap.exists()),
    () => onUpdate(false)
  );
}

export type FollowingRow = { targetUid: string; targetUsername: string; createdAtMs: number };

export function subscribeFollowing(
  viewerUid: string | undefined,
  onUpdate: (rows: FollowingRow[]) => void
) {
  if (!isFirebaseConfigured() || !viewerUid) {
    onUpdate([]);
    return () => {};
  }
  const q = query(
    collection(firestore(), 'users', viewerUid, 'following'),
    orderBy('createdAt', 'desc'),
    limit(200)
  );
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data: any = d.data();
          const createdAtMs =
            typeof data?.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : 0;
          return {
            targetUid: d.id,
            targetUsername: String(data?.targetUsername ?? 'user'),
            createdAtMs,
          };
        })
      );
    },
    () => onUpdate([])
  );
}

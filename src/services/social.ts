import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export type NotificationType = 'like' | 'comment' | 'follow' | 'admin_alert';

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

/** Count unread rows (recent slice) for app icon badge sync. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  if (!isFirebaseConfigured() || !userId) return 0;
  const snap = await getDocs(
    query(
      collection(firestore(), 'users', userId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(120)
    )
  );
  return snap.docs.filter((d) => (d.data() as { read?: boolean }).read !== true).length;
}

/** Mark recent inbox rows read (e.g. when opening the notifications screen or bell). */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  if (!isFirebaseConfigured() || !userId) return;
  const snap = await getDocs(
    query(
      collection(firestore(), 'users', userId, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(200)
    )
  );
  const batch = writeBatch(firestore());
  let ops = 0;
  for (const d of snap.docs) {
    const data = d.data() as { read?: boolean };
    if (data.read === true) continue;
    batch.update(d.ref, { read: true });
    ops += 1;
    if (ops >= 450) break;
  }
  if (ops > 0) await batch.commit();
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
            read: data?.read === true,
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
  /** Denormalized from `users/{targetUid}.photoUrl` when known (lists / follow UIs). */
  targetPhotoUrl?: string | null;
}) {
  const { viewerUid, targetUid, targetUsername, viewerUsername, targetPhotoUrl } = opts;
  if (!isFirebaseConfigured() || viewerUid === targetUid) return;
  const photo = (targetPhotoUrl && String(targetPhotoUrl).trim()) || null;
  await setDoc(doc(firestore(), 'users', viewerUid, 'following', targetUid), {
    targetUsername,
    createdAt: serverTimestamp(),
    targetPhotoUrl: photo,
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

export type FollowingRow = {
  targetUid: string;
  targetUsername: string;
  createdAtMs: number;
  /** Denormalized public avatar URL; may lag until `syncFollowingProfilePhotos` runs. */
  targetPhotoUrl?: string | null;
};

/**
 * For each `users/{viewerUid}/following/*` row, copies current `users/{targetUid}.photoUrl`
 * into `targetPhotoUrl` when it differs. Call after load (e.g. Following list) so avatars match profiles
 * without a Cloud Function when someone changes their photo.
 */
export async function syncFollowingProfilePhotos(viewerUid: string): Promise<void> {
  if (!isFirebaseConfigured() || !viewerUid) return;
  const snap = await getDocs(
    query(collection(firestore(), 'users', viewerUid, 'following'), limit(200))
  );
  for (const d of snap.docs) {
    const targetUid = d.id;
    const data = d.data() as Record<string, unknown>;
    const prev =
      typeof data.targetPhotoUrl === 'string' ? String(data.targetPhotoUrl).trim() : '';
    const userSnap = await getDoc(doc(firestore(), 'users', targetUid));
    const next = userSnap.exists()
      ? String((userSnap.data() as Record<string, unknown>)?.photoUrl ?? '').trim()
      : '';
    if (prev === next) continue;
    try {
      await updateDoc(d.ref, { targetPhotoUrl: next || null });
    } catch {
      // Rules or missing doc; ignore single-row failures
    }
  }
}

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
          const rawPhoto = data?.targetPhotoUrl;
          const targetPhotoUrl =
            typeof rawPhoto === 'string' ? (rawPhoto.trim() || null) : null;
          return {
            targetUid: d.id,
            targetUsername: String(data?.targetUsername ?? 'user'),
            createdAtMs,
            targetPhotoUrl,
          };
        })
      );
    },
    () => onUpdate([])
  );
}

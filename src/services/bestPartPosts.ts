import {
  collection,
  deleteField,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import {
  BEST_PART_COLLECTION,
  BEST_PART_MAX_CAPTION,
  bestPartDocId,
  type BestPartDoc,
  type BestPartMediaType,
  type BestPartPost,
} from '../types/bestPart';
import { parseCaptionHashtags } from '../utils/captionHashtags';
import { nyDateKey } from '../utils/nyTime';

function mapHashtags(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/^#+/u, '').toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out.length ? out : undefined;
}

function mapDoc(id: string, data: Record<string, unknown>): BestPartPost | null {
  const uid = typeof data.uid === 'string' ? data.uid : '';
  const username = typeof data.username === 'string' ? data.username : '';
  const dateKey = typeof data.dateKey === 'string' ? data.dateKey : '';
  const caption = typeof data.caption === 'string' ? data.caption : '';
  const mediaType = data.mediaType === 'photo' || data.mediaType === 'video' ? data.mediaType : null;
  const url = typeof data.url === 'string' ? data.url : '';
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath : '';
  if (!uid || !dateKey || !mediaType || !url || !storagePath) return null;
  return {
    id,
    uid,
    username: username || 'user',
    photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : undefined,
    dateKey,
    caption,
    hashtags: mapHashtags(data.hashtags) ?? parseCaptionHashtags(caption),
    mediaType,
    url,
    storagePath,
    feedUrl: typeof data.feedUrl === 'string' ? data.feedUrl : undefined,
    feedStoragePath: typeof data.feedStoragePath === 'string' ? data.feedStoragePath : undefined,
    posterUrl: typeof data.posterUrl === 'string' ? data.posterUrl : undefined,
    secondaryUrl: typeof data.secondaryUrl === 'string' ? data.secondaryUrl : undefined,
    secondaryStoragePath:
      typeof data.secondaryStoragePath === 'string' ? data.secondaryStoragePath : undefined,
    feedSecondaryUrl:
      typeof data.feedSecondaryUrl === 'string' ? data.feedSecondaryUrl : undefined,
    feedSecondaryStoragePath:
      typeof data.feedSecondaryStoragePath === 'string'
        ? data.feedSecondaryStoragePath
        : undefined,
    feedEncodeVersion:
      typeof data.feedEncodeVersion === 'string' ? data.feedEncodeVersion : undefined,
    dualFrontIsPrimary: data.dualFrontIsPrimary === true,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : undefined,
    isPrivate: data.isPrivate === true,
    deleted: data.deleted === true,
    likesCount: typeof data.likesCount === 'number' ? data.likesCount : 0,
    commentsCount: typeof data.commentsCount === 'number' ? data.commentsCount : 0,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function commitBestPartPost(args: {
  uid: string;
  username: string;
  caption: string;
  mediaType: BestPartMediaType;
  url: string;
  storagePath: string;
  secondaryUrl?: string;
  secondaryStoragePath?: string;
  dualFrontIsPrimary?: boolean;
  isPrivate: boolean;
  durationSeconds?: number;
  dateKey?: string;
}): Promise<{ id: string; dateKey: string }> {
  const caption = args.caption.trim();
  if (!caption) throw new Error('Add a short caption.');
  if (caption.length > BEST_PART_MAX_CAPTION) {
    throw new Error(`Caption must be ${BEST_PART_MAX_CAPTION} characters or fewer.`);
  }

  const dateKey = args.dateKey ?? nyDateKey();
  const id = bestPartDocId(args.uid, dateKey);
  const userSnap = await getDoc(doc(firestore(), 'users', args.uid));
  const photoUrl =
    typeof userSnap.data()?.photoUrl === 'string' ? String(userSnap.data()?.photoUrl).trim() : '';

  const existing = await getDoc(doc(firestore(), BEST_PART_COLLECTION, id));
  const prev = existing.exists() ? (existing.data() as Partial<BestPartDoc>) : null;

  const hashtags = parseCaptionHashtags(caption);

  const payload: Record<string, unknown> = {
    uid: args.uid,
    username: args.username.trim() || 'user',
    ...(photoUrl ? { photoUrl } : {}),
    dateKey,
    caption,
    hashtags,
    mediaType: args.mediaType,
    url: args.url,
    storagePath: args.storagePath,
    ...(typeof args.durationSeconds === 'number' ? { durationSeconds: args.durationSeconds } : {}),
    isPrivate: args.isPrivate === true,
    deleted: false,
    likesCount: typeof prev?.likesCount === 'number' ? prev.likesCount : 0,
    commentsCount: typeof prev?.commentsCount === 'number' ? prev.commentsCount : 0,
    createdAt: prev?.createdAt ?? serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (args.secondaryUrl && args.secondaryStoragePath) {
    payload.secondaryUrl = args.secondaryUrl;
    payload.secondaryStoragePath = args.secondaryStoragePath;
    payload.dualFrontIsPrimary = args.dualFrontIsPrimary === true;
  } else if (existing.exists()) {
    payload.secondaryUrl = deleteField();
    payload.secondaryStoragePath = deleteField();
    payload.dualFrontIsPrimary = deleteField();
  }

  // Retake / replace media: drop stale feed derivatives so encode re-runs.
  if (existing.exists()) {
    const prevUrl = typeof prev?.url === 'string' ? prev.url : '';
    const prevPath = typeof prev?.storagePath === 'string' ? prev.storagePath : '';
    const mediaChanged = prevUrl !== args.url || prevPath !== args.storagePath;
    if (mediaChanged || prev?.deleted === true) {
      payload.feedUrl = deleteField();
      payload.feedStoragePath = deleteField();
      payload.feedSecondaryUrl = deleteField();
      payload.feedSecondaryStoragePath = deleteField();
      payload.feedEncodeVersion = deleteField();
      payload.faststartReady = deleteField();
      payload.faststartUpdatedAt = deleteField();
      payload.posterUrl = deleteField();
      payload.posterStoragePath = deleteField();
    }
  }

  await setDoc(doc(firestore(), BEST_PART_COLLECTION, id), payload, { merge: true });
  return { id, dateKey };
}

export function subscribeMyBestParts(
  uid: string,
  onData: (posts: BestPartPost[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(
    collection(firestore(), BEST_PART_COLLECTION),
    where('uid', '==', uid),
    where('deleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(80)
  );
  return onSnapshot(
    q,
    (snap) => {
      const posts: BestPartPost[] = [];
      for (const d of snap.docs) {
        const mapped = mapDoc(d.id, d.data() as Record<string, unknown>);
        if (mapped) posts.push(mapped);
      }
      onData(posts);
    },
    (err) => onError?.(err)
  );
}

export function subscribeCommunityBestParts(
  dateKey: string,
  onData: (posts: BestPartPost[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const day = dateKey.trim() || nyDateKey();
  const q = query(
    collection(firestore(), BEST_PART_COLLECTION),
    where('isPrivate', '==', false),
    where('deleted', '==', false),
    where('dateKey', '==', day),
    orderBy('createdAt', 'desc'),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const posts: BestPartPost[] = [];
      for (const d of snap.docs) {
        const mapped = mapDoc(d.id, d.data() as Record<string, unknown>);
        if (mapped) posts.push(mapped);
      }
      onData(posts);
    },
    (err) => onError?.(err)
  );
}

export async function getTodayBestPart(uid: string): Promise<BestPartPost | null> {
  const id = bestPartDocId(uid, nyDateKey());
  const snap = await getDoc(doc(firestore(), BEST_PART_COLLECTION, id));
  if (!snap.exists()) return null;
  const mapped = mapDoc(snap.id, snap.data() as Record<string, unknown>);
  if (!mapped || mapped.deleted) return null;
  return mapped;
}

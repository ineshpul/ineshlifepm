import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';

import { firestore, storage } from '../firebase/firebase';
import { BEST_PART_COLLECTION } from '../types/bestPart';
import { scheduleVerticalScoreRecompute } from './verticalScore';

async function tryDeleteStoragePath(path: string | undefined) {
  if (!path) return;
  try {
    await deleteObject(ref(storage(), path));
  } catch {
    /* best-effort — soft-delete already hides the post */
  }
}

/**
 * Soft-deletes a Best Part the viewer owns (`deleted: true`), then best-effort
 * removes Storage objects. Firestore rules disallow hard delete on this doc.
 */
export async function deleteOwnedBestPart(args: {
  bestPartId: string;
  viewerUid: string;
}): Promise<void> {
  const { bestPartId, viewerUid } = args;
  const bref = doc(firestore(), BEST_PART_COLLECTION, bestPartId);
  const snap = await getDoc(bref);
  if (!snap.exists()) return;

  const data = snap.data() as Record<string, unknown>;
  if (String(data.uid ?? '') !== viewerUid) {
    throw new Error('You can only delete your own moments.');
  }
  if (data.deleted === true) return;

  await updateDoc(bref, {
    deleted: true,
    updatedAt: serverTimestamp(),
  });

  await Promise.all([
    tryDeleteStoragePath(typeof data.storagePath === 'string' ? data.storagePath : undefined),
    tryDeleteStoragePath(
      typeof data.secondaryStoragePath === 'string' ? data.secondaryStoragePath : undefined
    ),
    tryDeleteStoragePath(
      typeof data.feedStoragePath === 'string' ? data.feedStoragePath : undefined
    ),
    tryDeleteStoragePath(
      typeof data.feedSecondaryStoragePath === 'string'
        ? data.feedSecondaryStoragePath
        : undefined
    ),
  ]);

  scheduleVerticalScoreRecompute(viewerUid);
}

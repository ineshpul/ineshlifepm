import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';

/** Staff-only: null another user’s approved leap (inches revoked via Cloud Function). */
export async function staffNullVideo(videoId: string): Promise<void> {
  const vref = doc(firestore(), 'videos', videoId);
  const snap = await getDoc(vref);
  if (!snap.exists()) {
    throw new Error('Video not found.');
  }
  const data = snap.data() as Record<string, unknown>;
  if (String(data.moderationStatus ?? '') === 'nulled') {
    return;
  }
  if (String(data.moderationStatus ?? '') !== 'approved') {
    throw new Error('Only approved leaps can be nulled.');
  }
  await updateDoc(vref, { moderationStatus: 'nulled' });
}

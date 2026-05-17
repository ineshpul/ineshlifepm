import { doc, updateDoc } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

export async function setShowFollowingListToOthers(uid: string, value: boolean): Promise<void> {
  if (!isFirebaseConfigured() || !uid) return;
  await updateDoc(doc(firestore(), 'users', uid), { showFollowingListToOthers: value });
}

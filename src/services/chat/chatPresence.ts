import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';

import { firestore } from '../../firebase/firebase';
import type { UserPresenceDoc } from '../../chat/types';
import * as P from './paths';

export function presenceRef(uid: string) {
  return doc(firestore(), P.USER_PRESENCE, uid);
}

export function subscribePresence(
  uid: string,
  onData: (p: UserPresenceDoc | null) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    presenceRef(uid),
    (snap) => {
      if (!snap.exists()) onData(null);
      else {
        const d = snap.data() as Record<string, unknown>;
        onData({
          uid: snap.id,
          state: d.state === 'online' ? 'online' : 'offline',
          lastSeenAt: (d.lastSeenAt as Timestamp) ?? null,
        });
      }
    },
    (e) => onError?.(e as Error)
  );
}

export async function setPresenceOnline(uid: string): Promise<void> {
  const ref = presenceRef(uid);
  await setDoc(
    ref,
    { state: 'online', lastSeenAt: serverTimestamp() },
    { merge: true }
  );
}

export async function setPresenceOffline(uid: string): Promise<void> {
  await updateDoc(presenceRef(uid), {
    state: 'offline',
    lastSeenAt: serverTimestamp(),
  });
}

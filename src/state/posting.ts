import * as React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

/** Matches `videos` doc id from `commitPostedVideo` — avoids a composite index on (uid, challengeDate). */
export function todayVideoDocId(uid: string, challengeDate: string) {
  return `${uid}_${challengeDate}`;
}

export function useHasPostedToday(uid: string | undefined, dateKey: string) {
  const [posted, setPosted] = React.useState(false);

  React.useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setPosted(false);
      return;
    }

    const ref = doc(firestore(), 'videos', todayVideoDocId(uid, dateKey));
    return onSnapshot(ref, (snap) => setPosted(snap.exists()));
  }, [uid, dateKey]);

  return posted;
}

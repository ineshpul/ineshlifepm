import * as React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { computeFeedViewingFromNow } from '../utils/nyTime';

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

/**
 * Everyone feed: unlocked after you post for the active NY **noon→noon** cycle; locks again at next noon ET.
 */
export function useCanViewEveryoneFeed(uid: string | undefined) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);
  void tick;
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  return useHasPostedToday(uid, viewingChallengeDateKey);
}

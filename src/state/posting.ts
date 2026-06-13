import * as React from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';

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
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setPosted(false);
        return;
      }
      const data = snap.data() as { uid?: string; deleted?: boolean } | undefined;
      if (String(data?.uid ?? '') !== uid) {
        setPosted(false);
        return;
      }
      if (data?.deleted === true) {
        setPosted(false);
        return;
      }
      setPosted(true);
    });
  }, [uid, dateKey]);

  return posted;
}

/**
 * Everyone feed: unlocked after you post for the active NY **noon→noon** cycle; locks again at next noon ET.
 */
export function useCanViewEveryoneFeed(uid: string | undefined) {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    /** Aligns with noon-boundary unlock; 250ms was unnecessary churn on screens that use this hook (e.g. Feed). */
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  return useHasPostedToday(uid, viewingChallengeDateKey);
}

/**
 * Centralized gate for viewing other users' video content.
 * Primary rule: must have posted for the current noon→noon cycle (`useCanViewEveryoneFeed`).
 * Staff override: admins/moderators may view on profile/leap screens (moderation/support).
 * Feed tab uses {@link AuthUser.bypassFeedGate} for review demo accounts only.
 */
export function useCanViewOtherUsersVideos(args: {
  uid: string | undefined;
  isAdmin?: boolean;
  isModerator?: boolean;
}): boolean {
  const { uid, isAdmin, isModerator } = args;
  const canView = useCanViewEveryoneFeed(uid);
  return Boolean(canView || isAdmin || isModerator);
}

/**
 * True if this user has at least one non-deleted video doc (any challenge).
 * Used to gate watching **other** users’ videos / feed / reels consistently.
 */
export function useHasPostedAnyVideo(uid: string | undefined) {
  const [hasAny, setHasAny] = React.useState(false);

  React.useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setHasAny(false);
      return;
    }
    const q = query(collection(firestore(), 'videos'), where('uid', '==', uid), limit(40));
    return onSnapshot(
      q,
      (snap) => {
        const ok = snap.docs.some((d) => !Boolean((d.data() as { deleted?: boolean })?.deleted));
        setHasAny(ok);
      },
      () => setHasAny(false)
    );
  }, [uid]);

  return hasAny;
}

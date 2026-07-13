import * as React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { isActiveLeapVideoDoc } from '../lib/leapVideoDoc';
import { userVideosQuery } from '../lib/userVideosQuery';
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
      const data = snap.data() as {
        uid?: string;
        deleted?: boolean;
        moderationStatus?: string;
      } | undefined;
      setPosted(isActiveLeapVideoDoc(data, uid));
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
 * `gate_off` experiment cohort is fully unlocked (same viewing access as bypass).
 */
export function useCanViewOtherUsersVideos(args: {
  uid: string | undefined;
  isAdmin?: boolean;
  isModerator?: boolean;
  /** When `gate_off`, feed/profile/leap gates are fully unlocked. */
  experimentCohort?: 'gate_on' | 'gate_off' | null;
}): boolean {
  const { uid, isAdmin, isModerator, experimentCohort } = args;
  const canView = useCanViewEveryoneFeed(uid);
  return Boolean(canView || isAdmin || isModerator || experimentCohort === 'gate_off');
}

/**
 * True if this user has at least one non-deleted video doc (any challenge).
 * Used to gate watching **other** users’ videos / feed / reels consistently.
 */
export function useHasPostedAnyVideo(uid: string | undefined) {
  const [hasAny, setHasAny] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(() => !uid || !isFirebaseConfigured());

  React.useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setHasAny(false);
      setHydrated(true);
      return;
    }
    setHydrated(false);
    const q = userVideosQuery({ uid, limitN: 1 });
    return onSnapshot(
      q,
      (snap) => {
        const ok = snap.docs.some((d) => !Boolean((d.data() as { deleted?: boolean })?.deleted));
        setHasAny(ok);
        setHydrated(true);
      },
      () => {
        setHasAny(false);
        setHydrated(true);
      }
    );
  }, [uid]);

  return { hasEverPosted: hasAny, hasEverPostedHydrated: hydrated };
}

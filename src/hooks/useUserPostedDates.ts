import * as React from 'react';
import { onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { isIntroLeapDoc } from '../lib/leapVideoDoc';
import { userVideosQuery } from '../lib/userVideosQuery';
import { normalizeNyDateKey, nyDateKey } from '../utils/nyTime';
import { maxPostedChallengeDateKey } from '../state/feedGate';

function challengeDateFromVideoData(data: Record<string, unknown> | undefined): string {
  if (!data) return '';
  const raw = data.challengeDate;
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') {
    return normalizeNyDateKey(nyDateKey((raw as { toDate: () => Date }).toDate()), '');
  }
  return normalizeNyDateKey(String(raw ?? ''), '');
}

/** Non-deleted `videos.challengeDate` keys the signed-in user has posted to. */
export function useUserPostedDates(uid: string | undefined) {
  const [postedDates, setPostedDates] = React.useState<ReadonlySet<string>>(() => new Set());
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!uid || !isFirebaseConfigured()) {
      setPostedDates(new Set());
      setReady(true);
      return;
    }

    const q = userVideosQuery({ uid, limitN: 120 });
    return onSnapshot(
      q,
      (snap) => {
        const next = new Set<string>();
        for (const d of snap.docs) {
          const data = d.data() as { deleted?: boolean; isIntroLeap?: boolean; source?: string };
          if (data?.deleted === true) continue;
          if (isIntroLeapDoc(data)) continue;
          const cd = challengeDateFromVideoData(data as Record<string, unknown>);
          if (cd) next.add(cd);
        }
        setPostedDates(next);
        setReady(true);
      },
      () => {
        setPostedDates(new Set());
        setReady(true);
      }
    );
  }, [uid]);

  return {
    postedDates,
    postedDatesReady: ready,
    lastPostedDateKey: React.useMemo(() => maxPostedChallengeDateKey(postedDates), [postedDates]),
  };
}

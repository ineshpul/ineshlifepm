import * as React from 'react';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';

const MIN_TEASER = 10;
const MAX_TEASER = 20;
/** Accept legacy rolls up to 30 so existing accounts keep their stored limit. */
const MAX_TEASER_STORED = 30;

export function randomFeedTeaserCardLimit(): number {
  return MIN_TEASER + Math.floor(Math.random() * (MAX_TEASER - MIN_TEASER + 1));
}

function parseTeaserLimit(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n) || n < MIN_TEASER || n > MAX_TEASER_STORED) return null;
  return Math.floor(n);
}

/**
 * Read-or-roll `users/{uid}.feedTeaserCardLimit` once per account (write-once transaction).
 */
export async function ensureFeedTeaserCardLimit(uid: string): Promise<number> {
  if (!uid || !isFirebaseConfigured()) return 20;

  const ref = doc(firestore(), 'users', uid);
  return runTransaction(firestore(), async (tx) => {
    const snap = await tx.get(ref);
    const existing = parseTeaserLimit(snap.data()?.feedTeaserCardLimit);
    if (existing != null) return existing;

    const rolled = randomFeedTeaserCardLimit();
    if (!snap.exists()) {
      // Profile doc may still be bootstrapping — use in-memory limit until next snapshot.
      return rolled;
    }
    tx.update(ref, { feedTeaserCardLimit: rolled });
    return rolled;
  });
}

/** Tier 1 only — loads persisted teaser card count from Firestore. */
export function useFeedTeaserCardLimit(uid: string | undefined, enabled: boolean) {
  const [teaserLimit, setTeaserLimit] = React.useState<number | null>(null);
  const [teaserLimitReady, setTeaserLimitReady] = React.useState(!enabled);
  const rollAttemptedRef = React.useRef(false);

  React.useEffect(() => {
    rollAttemptedRef.current = false;
  }, [uid]);

  React.useEffect(() => {
    if (!enabled || !uid) {
      setTeaserLimit(null);
      setTeaserLimitReady(true);
      return;
    }

    let cancelled = false;
    setTeaserLimitReady(false);

    const ref = doc(firestore(), 'users', uid);
    const unsub = isFirebaseConfigured()
      ? onSnapshot(
          ref,
          (snap) => {
            const parsed = parseTeaserLimit(snap.data()?.feedTeaserCardLimit);
            if (parsed != null) {
              if (!cancelled) {
                setTeaserLimit(parsed);
                setTeaserLimitReady(true);
              }
              return;
            }
            if (rollAttemptedRef.current) return;
            rollAttemptedRef.current = true;
            void ensureFeedTeaserCardLimit(uid)
              .then((n) => {
                if (!cancelled) {
                  setTeaserLimit(n);
                  setTeaserLimitReady(true);
                }
              })
              .catch(() => {
                if (!cancelled) {
                  setTeaserLimit(20);
                  setTeaserLimitReady(true);
                }
              });
          },
          () => {
            if (!cancelled) {
              setTeaserLimit(20);
              setTeaserLimitReady(true);
            }
          }
        )
      : undefined;

    if (!isFirebaseConfigured()) {
      setTeaserLimit(20);
      setTeaserLimitReady(true);
    }

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [uid, enabled]);

  return { teaserLimit, teaserLimitReady };
}

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { firebaseAuth, firebaseFunctions, firestore, isFirebaseConfigured } from '../firebase/firebase';

export type ChallengeSuggestionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'won'
  | 'removed';

export type ChallengeSuggestion = {
  id: string;
  text: string;
  suggestedByUid: string;
  suggestedByUsername: string;
  status: ChallengeSuggestionStatus;
  voteCount: number;
  createdAtMs: number;
  wonForDateKey?: string;
};

export type SuggestionVoteDay = {
  id: string;
  ballotDateKey: string;
  suggestionId: string;
  uid: string;
};

async function ensureAuthedCallable() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const auth = firebaseAuth();
  await auth.authStateReady();
  const cur = auth.currentUser;
  if (!cur) {
    throw new Error('Sign in required.');
  }
  await cur.getIdToken(true);
  return cur;
}

/**
 * Ensures Auth is fully restored and a fresh ID token exists before calling a callable.
 * Without this, `httpsCallable` can omit the `Authorization` header (race on cold start /
 * Functions resolving before Auth registers), which surfaces as `functions/unauthenticated`.
 */
export async function submitChallengeSuggestion(text: string): Promise<{ suggestionId: string }> {
  await ensureAuthedCallable();
  const fn = httpsCallable(firebaseFunctions(), 'submitChallengeSuggestionCallable');
  const res = await fn({ text });
  const data = (res.data ?? {}) as { suggestionId?: string };
  return { suggestionId: String(data.suggestionId ?? '') };
}

export async function voteTomorrowLeap(suggestionId: string): Promise<void> {
  await ensureAuthedCallable();
  const fn = httpsCallable(firebaseFunctions(), 'voteTomorrowLeapCallable');
  await fn({ suggestionId });
}

export async function moderateChallengeSuggestion(
  suggestionId: string,
  action: 'approve' | 'reject' | 'remove'
): Promise<void> {
  await ensureAuthedCallable();
  const fn = httpsCallable(firebaseFunctions(), 'moderateChallengeSuggestionCallable');
  await fn({ suggestionId, action });
}

function mapSuggestionDoc(id: string, data: Record<string, unknown>): ChallengeSuggestion {
  const createdAtMs =
    typeof (data as any)?.createdAt?.toMillis === 'function' ? (data as any).createdAt.toMillis() : 0;
  return {
    id,
    text: String(data.text ?? ''),
    suggestedByUid: String(data.suggestedByUid ?? ''),
    suggestedByUsername: String(data.suggestedByUsername ?? 'user'),
    status: String(data.status ?? 'pending') as ChallengeSuggestionStatus,
    voteCount: Math.max(0, Number(data.voteCount ?? 0) || 0),
    createdAtMs,
    wonForDateKey: data.wonForDateKey ? String(data.wonForDateKey) : undefined,
  };
}

/** Live list of approved suggestions ranked for the public ballot. */
export function subscribeApprovedSuggestions(
  onData: (rows: ChallengeSuggestion[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(firestore(), 'challengeSuggestions'),
    where('status', '==', 'approved'),
    orderBy('voteCount', 'desc'),
    orderBy('createdAt', 'asc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapSuggestionDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err)
  );
}

/** Staff pending queue. */
export function subscribePendingSuggestions(
  onData: (rows: ChallengeSuggestion[]) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onData([]);
    return () => {};
  }
  const q = query(
    collection(firestore(), 'challengeSuggestions'),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => mapSuggestionDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err)
  );
}

export function subscribeMyVoteForBallot(
  uid: string,
  ballotDateKey: string,
  onData: (vote: SuggestionVoteDay | null) => void,
  onError?: (err: unknown) => void
): Unsubscribe {
  if (!isFirebaseConfigured() || !uid || !ballotDateKey) {
    onData(null);
    return () => {};
  }
  const id = `${ballotDateKey}_${uid}`;
  return onSnapshot(
    doc(firestore(), 'suggestionVoteDays', id),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      onData({
        id: snap.id,
        ballotDateKey: String(data.ballotDateKey ?? ballotDateKey),
        suggestionId: String(data.suggestionId ?? ''),
        uid: String(data.uid ?? uid),
      });
    },
    (err) => onError?.(err)
  );
}

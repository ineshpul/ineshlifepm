import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import type { CommentAudience, SettingsPreferencesState } from '../state/settingsPreferences';

export type ServerPrivacyFields = {
  privateAccount: boolean;
  whoCanComment: CommentAudience;
  whoCanMessage: 'everyone' | 'friends';
  showFollowingListToOthers: boolean;
  showStreakPublic: boolean;
  showScorePublic: boolean;
};

const PRIVACY_KEYS: (keyof ServerPrivacyFields)[] = [
  'privateAccount',
  'whoCanComment',
  'whoCanMessage',
  'showFollowingListToOthers',
  'showStreakPublic',
  'showScorePublic',
];

export function privacyPatchFromPreferences(
  partial: Partial<SettingsPreferencesState>
): Partial<ServerPrivacyFields> | null {
  const out: Partial<ServerPrivacyFields> = {};
  if ('privateAccount' in partial) out.privateAccount = !!partial.privateAccount;
  if ('whoCanComment' in partial) out.whoCanComment = partial.whoCanComment ?? 'everyone';
  if ('whoCanMessage' in partial) {
    out.whoCanMessage = partial.whoCanMessage === 'friends' ? 'friends' : 'everyone';
  }
  if ('activityStatus' in partial) {
    out.showFollowingListToOthers = partial.activityStatus !== false;
  }
  if ('showStreakPublic' in partial) out.showStreakPublic = partial.showStreakPublic !== false;
  if ('showScorePublic' in partial) out.showScorePublic = partial.showScorePublic !== false;
  return Object.keys(out).length ? out : null;
}

export async function syncPrivacySettingsToFirestore(
  uid: string,
  fields: Partial<ServerPrivacyFields>
): Promise<void> {
  if (!isFirebaseConfigured() || !uid || !Object.keys(fields).length) return;
  const payload: Record<string, unknown> = { ...fields, updatedAt: serverTimestamp() };
  if (fields.whoCanMessage) {
    payload.chatMessageAudience = fields.whoCanMessage;
  }
  await setDoc(doc(firestore(), 'users', uid), payload, { merge: true });
}

export async function loadPrivacySettingsFromFirestore(
  uid: string
): Promise<Partial<ServerPrivacyFields> | null> {
  if (!isFirebaseConfigured() || !uid) return null;
  const snap = await getDoc(doc(firestore(), 'users', uid));
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  const out: Partial<ServerPrivacyFields> = {};
  for (const k of PRIVACY_KEYS) {
    if (k in d) (out as Record<string, unknown>)[k] = d[k];
  }
  return Object.keys(out).length ? out : null;
}

export function mergePrivacyIntoPreferences(
  prefs: SettingsPreferencesState,
  server: Partial<ServerPrivacyFields>
): SettingsPreferencesState {
  return {
    ...prefs,
    ...(server.privateAccount !== undefined ? { privateAccount: !!server.privateAccount } : {}),
    ...(server.whoCanComment ? { whoCanComment: server.whoCanComment } : {}),
    ...(server.whoCanMessage ? { whoCanMessage: server.whoCanMessage } : {}),
    ...(server.showFollowingListToOthers !== undefined
      ? { activityStatus: server.showFollowingListToOthers !== false }
      : {}),
    ...(server.showStreakPublic !== undefined
      ? { showStreakPublic: server.showStreakPublic !== false }
      : {}),
    ...(server.showScorePublic !== undefined
      ? { showScorePublic: server.showScorePublic !== false }
      : {}),
  };
}

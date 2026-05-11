import type { NavigatorScreenParams } from '@react-navigation/native';

import type { LegalDocId } from '../content/settingsLegal';
import type { TabsParamList } from './Tabs';

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  ForgotPassword: { email?: string } | undefined;
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  /** Full-screen camera / post flow (opened from Leap — not a bottom tab). */
  Record: undefined;
  ChallengeAdmin: undefined;
  Notifications: undefined;
  Settings: undefined;
  BlockedUsers: undefined;
  MutedUsers: undefined;
  LegalDocument: { docId: LegalDocId };
  UserProfile: { uid: string; username?: string };
  FollowingList: undefined;
  /** Full-screen reel of only your posts (opened from Me, not a tab). */
  MyLeaps: undefined;
  /** Full-screen reel for another user (opened from profile). */
  UserLeaps: { uid: string; username?: string };
  /** Explains posting before viewing someone else’s leaps; primary action opens Record. */
  TakeTheLeapForLeaps: { uid: string; username?: string };
  /** Opens a single leap by Firestore `videos/{videoId}` (e.g. profile “best vertical gain” post). */
  VideoPost: { videoId: string };
  AdminVideoModeration: undefined;
};

/** Root stack without auth-only screens (used after login so iOS never keeps a stale Sign In route). */
export type MainStackParamList = Omit<RootStackParamList, 'SignUp' | 'SignIn' | 'ForgotPassword'>;
export type AuthStackParamList = Pick<RootStackParamList, 'SignUp' | 'SignIn' | 'ForgotPassword'>;

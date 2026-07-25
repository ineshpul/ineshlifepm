import type { NavigatorScreenParams } from '@react-navigation/native';

import type { LegalDocId } from '../content/settingsLegal';
import type { TabsParamList } from './Tabs';

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  ForgotPassword: { email?: string } | undefined;
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  /** Leaperboard — opened from Daily Leaps feed (not a bottom tab). */
  Leaperboard: undefined;
  /** Full-screen camera / post flow (opened from Leap — not a bottom tab). */
  Record: undefined;
  /** Best part of your day — live photo/video capture + caption (not a bottom tab). */
  BestPartCapture: undefined;
  /** Sunday-style playback of this week’s best-part moments. */
  BestPartWeekRecap: {
    posts: Array<{
      id: string;
      dateKey: string;
      caption: string;
      mediaType: 'photo' | 'video';
      url: string;
    }>;
  };
  ChallengeAdmin: undefined;
  Notifications: undefined;
  Settings: undefined;
  BlockedUsers: undefined;
  MutedUsers: undefined;
  LegalDocument: { docId: LegalDocId };
  UserProfile: { uid: string; username?: string };
  /** Own list when omitted; another user’s list when `uid` is set (requires their visibility setting). */
  FollowingList: { uid?: string; username?: string } | undefined;
  /** Full-screen reel of only your posts (opened from Me, not a tab). */
  MyLeaps: undefined;
  /** Full-screen reel for another user (opened from profile). */
  UserLeaps: { uid: string; username?: string };
  /** Explains posting before viewing someone else’s leaps; primary action opens Record. */
  TakeTheLeapForLeaps: { uid: string; username?: string };
  /** Opens a single leap by Firestore `videos/{videoId}` (e.g. profile “best vertical gain” post). */
  VideoPost: { videoId: string };
  /** Opens a single best-part moment (notification deep link). */
  BestPartPost: { bestPartId: string };
  AdminVideoModeration: undefined;
  /** Replay the first-run onboarding carousel (Settings). */
  OnboardingIntro: undefined;
};

/** Root stack without auth-only screens (used after login so iOS never keeps a stale Sign In route). */
export type MainStackParamList = Omit<RootStackParamList, 'SignUp' | 'SignIn' | 'ForgotPassword'>;
export type AuthStackParamList = Pick<RootStackParamList, 'SignUp' | 'SignIn' | 'ForgotPassword'>;

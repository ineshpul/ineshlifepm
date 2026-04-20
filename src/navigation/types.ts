import type { LegalDocId } from '../content/settingsLegal';

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
  ForgotPassword: { email?: string } | undefined;
  Tabs: undefined;
  ChallengeAdmin: undefined;
  Notifications: undefined;
  Settings: undefined;
  BlockedUsers: undefined;
  MutedUsers: undefined;
  LegalDocument: { docId: LegalDocId };
  UserProfile: { uid: string; username?: string };
  /** Opens a single leap by Firestore `videos/{videoId}` (e.g. profile “best vertical gain” post). */
  VideoPost: { videoId: string };
  AdminVideoModeration: undefined;
};

/** Root stack without auth-only screens (used after login so iOS never keeps a stale Sign In route). */
export type MainStackParamList = Omit<RootStackParamList, 'SignUp' | 'SignIn' | 'ForgotPassword'>;
export type AuthStackParamList = Pick<RootStackParamList, 'SignUp' | 'SignIn' | 'ForgotPassword'>;

import type { LegalDocId } from '../content/settingsLegal';

export type RootStackParamList = {
  SignUp: undefined;
  SignIn: undefined;
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

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
};

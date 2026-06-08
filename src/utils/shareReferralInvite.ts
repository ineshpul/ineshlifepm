import { Share } from 'react-native';

import { buildReferralShareMessage } from '../constants/referral';

export async function shareReferralInvite(username: string): Promise<void> {
  const handle = username.trim().replace(/^@+/u, '') || 'you';
  try {
    await Share.share({ message: buildReferralShareMessage(handle) });
  } catch {
    // dismissed
  }
}

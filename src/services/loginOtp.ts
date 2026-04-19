import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export async function sendLoginOtpEmail(email: string): Promise<{ otpId: string }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const fn = httpsCallable(firebaseFunctions(), 'sendLoginOtp');
  const res = await fn({ email: email.trim().toLowerCase() });
  const data = res.data as { otpId?: string };
  if (!data?.otpId) throw new Error('Unexpected response from server.');
  return { otpId: data.otpId };
}

export async function verifyLoginOtpCode(otpId: string, code: string): Promise<void> {
  const fn = httpsCallable(firebaseFunctions(), 'verifyLoginOtp');
  await fn({ otpId, code: code.trim().replace(/\s/g, '') });
}

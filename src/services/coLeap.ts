import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions } from '../firebase/firebase';

export type ConfirmCoLeapResult = {
  alreadyConfirmed: boolean;
  creditVideoId: string;
  challengeDate: string;
};

export async function confirmCoLeap(videoId: string): Promise<ConfirmCoLeapResult> {
  const fn = httpsCallable<{ videoId: string }, ConfirmCoLeapResult>(
    firebaseFunctions(),
    'confirmCoLeapCallable'
  );
  const res = await fn({ videoId });
  return res.data;
}

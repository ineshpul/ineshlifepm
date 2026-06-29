import * as React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { AppReviewModal } from './AppReviewModal';
import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { requestAppStoreReview } from '../services/appReview';
import { useAuth } from '../state/auth';
import {
  hasCompletedAppReviewPrompt,
  markAppReviewPromptCompleted,
  shouldShowAppReviewPrompt,
  snoozeAppReviewPrompt,
} from '../state/appReviewPrompt';
import { subscribeStaffAppReviewPrompt } from '../state/appReviewBroadcast';
import { hasCompletedOnboardingIntro } from '../state/onboardingIntro';
import { shouldShowReferralIntro } from '../state/referralIntro';

/**
 * Asks engaged users for an App Store review once (after referral intro + a few leaps).
 */
export function AppReviewHost() {
  const { user } = useAuth();
  const [visible, setVisible] = React.useState(false);
  const [staffPromptVisible, setStaffPromptVisible] = React.useState(false);
  const [challengesCompleted, setChallengesCompleted] = React.useState(0);

  React.useEffect(() => subscribeStaffAppReviewPrompt(() => setStaffPromptVisible(true)), []);

  React.useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setChallengesCompleted(0);
      setVisible(false);
      return;
    }

    const ref = doc(firestore(), 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const n = Math.max(0, Math.floor(Number(snap.data()?.challengesCompleted ?? 0)));
        setChallengesCompleted(n);
      },
      () => {
        setChallengesCompleted(0);
      }
    );

    return () => unsub();
  }, [user?.uid]);

  React.useEffect(() => {
    if (!user?.uid) {
      setVisible(false);
      return;
    }

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      if (await hasCompletedAppReviewPrompt(user.uid)) {
        if (!cancelled) setVisible(false);
        if (intervalId) clearInterval(intervalId);
        return;
      }

      const [showReferral, onboardingDone] = await Promise.all([
        shouldShowReferralIntro(user.uid),
        hasCompletedOnboardingIntro(user.uid),
      ]);
      const referralIntroSeen = !showReferral;
      const show =
        onboardingDone &&
        (await shouldShowAppReviewPrompt({
          uid: user.uid,
          challengesCompleted,
          referralIntroSeen,
        }));
      if (!cancelled) setVisible(show);
      if (show && intervalId) clearInterval(intervalId);
    };

    void run();
    intervalId = setInterval(() => void run(), 4000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [user?.uid, challengesCompleted]);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    setStaffPromptVisible(false);
    if (user?.uid) void snoozeAppReviewPrompt(user.uid);
  }, [user?.uid]);

  const onReview = React.useCallback(() => {
    setVisible(false);
    setStaffPromptVisible(false);
    if (user?.uid) void markAppReviewPromptCompleted(user.uid);
    // Present App Store after the RN modal unmounts — avoids swallowed native review sheets.
    setTimeout(() => {
      void requestAppStoreReview({ explicit: true });
    }, 350);
  }, [user?.uid]);

  const showModal = visible || staffPromptVisible;
  if (!showModal) return null;

  return <AppReviewModal visible={showModal} onReview={onReview} onDismiss={dismiss} />;
}

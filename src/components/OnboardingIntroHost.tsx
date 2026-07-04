import * as React from 'react';
import { StyleSheet, View } from 'react-native';

import { OnboardingIntroScreen } from '../screens/OnboardingIntroScreen';
import { ReferralIntroModal } from './ReferralIntroModal';
import { useAuth } from '../state/auth';
import { hasCompletedOnboardingIntro, markOnboardingIntroCompleted } from '../state/onboardingIntro';
import { markReferralIntroSeen, shouldShowReferralIntro } from '../state/referralIntro';
import { navigateToTodayAndRecord } from '../navigation/navigationHelpers';
import { shareReferralInvite } from '../utils/shareReferralInvite';

type FlowStep = 'check' | 'referral' | 'onboarding' | 'idle';

/**
 * Post-signup tutorial overlay. Runs referral intro first (if needed), then onboarding —
 * the last step before the Today tab / leap of the day is visible.
 */
export function OnboardingIntroHost() {
  const { user } = useAuth();
  const [step, setStep] = React.useState<FlowStep>('check');

  React.useEffect(() => {
    if (!user?.uid) {
      setStep('idle');
      return;
    }

    let cancelled = false;
    void (async () => {
      const onboardingDone = await hasCompletedOnboardingIntro(user.uid);
      if (cancelled) return;
      if (onboardingDone) {
        setStep('idle');
        return;
      }
      const showReferral = await shouldShowReferralIntro(user.uid);
      if (cancelled) return;
      setStep(showReferral ? 'referral' : 'onboarding');
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const finishReferral = React.useCallback(() => {
    if (user?.uid) void markReferralIntroSeen(user.uid);
    setStep('onboarding');
  }, [user?.uid]);

  const onReferralInvite = React.useCallback(() => {
    finishReferral();
    void shareReferralInvite(user?.username ?? '');
  }, [finishReferral, user?.username]);

  const onOnboardingFinish = React.useCallback(
    (action: { type: 'done' } | { type: 'record' }) => {
      const uid = user?.uid;
      const complete = () => {
        setStep('idle');
        if (action.type === 'record') {
          requestAnimationFrame(() => navigateToTodayAndRecord());
        }
      };
      if (!uid) {
        complete();
        return;
      }
      void markOnboardingIntroCompleted(uid).then(complete);
    },
    [user?.uid]
  );

  if (step === 'check' || step === 'idle') return null;

  return (
    <View style={styles.overlay} pointerEvents="auto">
      {step === 'referral' ? (
        <ReferralIntroModal visible onInvite={onReferralInvite} onDismiss={finishReferral} />
      ) : (
        <OnboardingIntroScreen onFinish={onOnboardingFinish} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
});

import * as React from 'react';
import { useNavigation } from '@react-navigation/native';

import { OnboardingIntroScreen } from './OnboardingIntroScreen';
import { markOnboardingIntroCompleted } from '../state/onboardingIntro';
import { navigateToRecord } from '../navigation/navigationHelpers';

/** Onboarding replay from Settings (logged-in stack). */
export function OnboardingIntroReplayScreen() {
  const navigation = useNavigation<any>();

  const onFinish = React.useCallback(
    (action: { type: 'done' } | { type: 'record' }) => {
      if (action.type === 'record') {
        navigateToRecord(navigation);
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    },
    [navigation]
  );

  return <OnboardingIntroScreen onFinish={onFinish} />;
}

/** First-run gate before auth / main app. */
export function OnboardingIntroGateScreen({
  onComplete,
}: {
  onComplete: (action: { type: 'done' } | { type: 'record' }) => void;
}) {
  const onFinish = React.useCallback(
    (action: { type: 'done' } | { type: 'record' }) => {
      void markOnboardingIntroCompleted().then(() => onComplete(action));
    },
    [onComplete]
  );

  return <OnboardingIntroScreen onFinish={onFinish} />;
}

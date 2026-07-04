import * as React from 'react';
import { useNavigation } from '@react-navigation/native';

import { OnboardingIntroScreen } from './OnboardingIntroScreen';
import { navigateToTodayAndRecord } from '../navigation/navigationHelpers';

/** Onboarding replay from Settings (logged-in stack). */
export function OnboardingIntroReplayScreen() {
  const navigation = useNavigation<any>();

  const onFinish = React.useCallback(
    (action: { type: 'done' } | { type: 'record' }) => {
      if (action.type === 'record') {
        navigateToTodayAndRecord();
        return;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      }
    },
    [navigation]
  );

  return <OnboardingIntroScreen onFinish={onFinish} />;
}

import * as React from 'react';

import { ReferralIntroModal } from './ReferralIntroModal';
import { rootNavigationRef } from '../navigation/RootNavigator';
import { useAuth } from '../state/auth';
import { markReferralIntroSeen, shouldShowReferralIntro } from '../state/referralIntro';

/**
 * One-time referral intro after login. Shown once per account (AsyncStorage).
 */
export function ReferralIntroHost() {
  const { user } = useAuth();
  const [visible, setVisible] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!user?.uid) {
      setVisible(false);
      setReady(false);
      return;
    }

    let cancelled = false;
    void shouldShowReferralIntro(user.uid).then((show) => {
      if (cancelled) return;
      setVisible(show);
      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const dismiss = React.useCallback(() => {
    setVisible(false);
    if (user?.uid) void markReferralIntroSeen(user.uid);
  }, [user?.uid]);

  const onInvite = React.useCallback(() => {
    dismiss();
    const go = () => {
      if (rootNavigationRef.isReady()) {
        rootNavigationRef.navigate('Settings');
      }
    };
    if (rootNavigationRef.isReady()) {
      go();
    } else {
      setTimeout(go, 120);
    }
  }, [dismiss]);

  if (!ready || !visible) return null;

  return <ReferralIntroModal visible={visible} onInvite={onInvite} onDismiss={dismiss} />;
}

import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { isFirebaseConfigured } from '../../firebase/firebase';
import { setPresenceOffline, setPresenceOnline, subscribePresence } from '../../services/chat/chatPresence';
import type { UserPresenceDoc } from '../types';

export function usePresence(uid: string | undefined) {
  const [presenceByUid, setPresenceByUid] = React.useState<Record<string, UserPresenceDoc | null>>({});

  const watch = React.useCallback((targetUid: string) => {
    if (!isFirebaseConfigured() || !targetUid) return () => {};
    return subscribePresence(targetUid, (p) => {
      setPresenceByUid((prev) => ({ ...prev, [targetUid]: p }));
    });
  }, []);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !uid) return;
    void setPresenceOnline(uid);
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s === 'active') void setPresenceOnline(uid);
      else void setPresenceOffline(uid);
    });
    return () => {
      sub.remove();
      void setPresenceOffline(uid);
    };
  }, [uid]);

  return { presenceByUid, watchPresence: watch };
}

import * as React from 'react';

import { initNativeAnalytics, setNativeAnalyticsUserId } from '../services/nativeAnalytics';
import { useAuth } from '../state/auth';

/** Boots iOS Firebase Analytics and ties events to the signed-in user when available. */
export function NativeAnalyticsSync() {
  const { user } = useAuth();

  React.useEffect(() => {
    void initNativeAnalytics();
  }, []);

  React.useEffect(() => {
    void setNativeAnalyticsUserId(user?.uid ?? null);
  }, [user?.uid]);

  return null;
}

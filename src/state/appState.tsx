import * as React from 'react';

import { useAuth } from './auth';
import { useChallengeWindow } from './challenge';
import { useHasPostedToday } from './posting';
import { computeFeedViewingFromNow } from '../utils/nyTime';

type AppStateValue = {
  hasPostedToday: boolean;
  markPostedToday: () => void;
  clearPostedOverride: () => void;
  resetForNewDay: () => void;
};

const AppStateContext = React.createContext<AppStateValue | null>(null);

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [day, setDay] = React.useState(() => todayKey());
  const [localPostedOverride, setLocalPostedOverride] = React.useState(false);

  const { user } = useAuth();
  useChallengeWindow();
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  const postedFromFirestore = useHasPostedToday(user?.uid, viewingChallengeDateKey);
  const hasPostedToday = postedFromFirestore || localPostedOverride;

  React.useEffect(() => {
    const id = setInterval(() => {
      const next = todayKey();
      if (next !== day) {
        setDay(next);
        setLocalPostedOverride(false);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [day]);

  React.useEffect(() => {
    setLocalPostedOverride(false);
  }, [viewingChallengeDateKey]);

  const markPostedToday = React.useCallback(() => {
    // Optimistic unlock for the current session; Firestore listener becomes source of truth.
    setLocalPostedOverride(true);
  }, []);

  const clearPostedOverride = React.useCallback(() => {
    setLocalPostedOverride(false);
  }, []);

  const resetForNewDay = React.useCallback(() => {
    setDay(todayKey());
    setLocalPostedOverride(false);
  }, []);

  const value: AppStateValue = React.useMemo(
    () => ({
      hasPostedToday,
      markPostedToday,
      clearPostedOverride,
      resetForNewDay,
    }),
    [hasPostedToday, markPostedToday, clearPostedOverride, resetForNewDay]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}


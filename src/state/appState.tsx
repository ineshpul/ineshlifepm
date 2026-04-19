import * as React from 'react';

import { useAuth } from './auth';
import { useChallengeWindow } from './challenge';
import { useHasPostedToday } from './posting';

type AppStateValue = {
  hasPostedToday: boolean;
  previewViewsRemaining: number;
  markPreviewView: () => void;
  markPostedToday: () => void;
  clearPostedOverride: () => void;
  resetForNewDay: () => void;
};

const AppStateContext = React.createContext<AppStateValue | null>(null);

const PREVIEW_LIMIT = 5;

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [day, setDay] = React.useState(() => todayKey());
  const [localPostedOverride, setLocalPostedOverride] = React.useState(false);
  const [previewViewsUsed, setPreviewViewsUsed] = React.useState(0);

  const { user } = useAuth();
  const win = useChallengeWindow();
  const postedFromFirestore = useHasPostedToday(user?.uid, win.dateKey);
  const hasPostedToday = postedFromFirestore || localPostedOverride;

  React.useEffect(() => {
    const id = setInterval(() => {
      const next = todayKey();
      if (next !== day) {
        setDay(next);
        setLocalPostedOverride(false);
        setPreviewViewsUsed(0);
      }
    }, 15_000);
    return () => clearInterval(id);
  }, [day]);

  React.useEffect(() => {
    // If the calendar day rolls in local time, reset preview counters.
    // Firestore posting state is keyed off NY challenge day via `win.dateKey`.
    setLocalPostedOverride(false);
    setPreviewViewsUsed(0);
  }, [win.dateKey]);

  const previewViewsRemaining = Math.max(0, PREVIEW_LIMIT - previewViewsUsed);

  const markPreviewView = React.useCallback(() => {
    setPreviewViewsUsed((v) => Math.min(PREVIEW_LIMIT, v + 1));
  }, []);

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
    setPreviewViewsUsed(0);
  }, []);

  const value: AppStateValue = React.useMemo(
    () => ({
      hasPostedToday,
      previewViewsRemaining,
      markPreviewView,
      markPostedToday,
      clearPostedOverride,
      resetForNewDay,
    }),
    [
      hasPostedToday,
      previewViewsRemaining,
      markPreviewView,
      markPostedToday,
      clearPostedOverride,
      resetForNewDay,
    ]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}


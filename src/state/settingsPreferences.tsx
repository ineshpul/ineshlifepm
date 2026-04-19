import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncLeapScheduledNotifications } from '../services/notifications';

const STORAGE_KEY = 'leap.settings.v3';

export type FeedType = 'mixed' | 'friends';
export type CommentAudience = 'everyone' | 'friends';
export type MessageAudience = 'everyone' | 'friends' | 'none';

export type SettingsPreferencesState = {
  notificationsEnabled: boolean;
  feedType: FeedType;
  autoPlayVideos: boolean;
  dataSaver: boolean;
  privateAccount: boolean;
  whoCanComment: CommentAudience;
  whoCanMessage: MessageAudience;
  activityStatus: boolean;
  showStreakPublic: boolean;
  showScorePublic: boolean;
  contentFiltering: boolean;
  streakReminders: boolean;
  saveToCameraRoll: boolean;
  uploadOnCellular: boolean;
  profileDisplayName: string;
  profileUsername: string;
  profileBio: string;
  profilePhotoUri: string | null;
  blockedUsernames: string[];
  mutedUsernames: string[];
};

export const SETTINGS_DEFAULTS: SettingsPreferencesState = {
  notificationsEnabled: true,
  feedType: 'mixed',
  autoPlayVideos: true,
  dataSaver: false,
  privateAccount: false,
  whoCanComment: 'everyone',
  whoCanMessage: 'everyone',
  activityStatus: true,
  showStreakPublic: true,
  showScorePublic: true,
  contentFiltering: true,
  streakReminders: true,
  saveToCameraRoll: true,
  uploadOnCellular: false,
  profileDisplayName: '',
  profileUsername: '',
  profileBio: '',
  profilePhotoUri: null,
  blockedUsernames: [],
  mutedUsernames: [],
};

type Ctx = {
  ready: boolean;
  preferences: SettingsPreferencesState;
  patch: (partial: Partial<SettingsPreferencesState>) => void;
  replace: (next: SettingsPreferencesState) => void;
};

const PrefsContext = React.createContext<Ctx | null>(null);

function mergeLoaded(raw: unknown): SettingsPreferencesState {
  if (!raw || typeof raw !== 'object') return { ...SETTINGS_DEFAULTS };
  const o = raw as Partial<SettingsPreferencesState>;
  return {
    ...SETTINGS_DEFAULTS,
    ...o,
    blockedUsernames: Array.isArray(o.blockedUsernames)
      ? o.blockedUsernames.map(String)
      : SETTINGS_DEFAULTS.blockedUsernames,
    mutedUsernames: Array.isArray(o.mutedUsernames)
      ? o.mutedUsernames.map(String)
      : SETTINGS_DEFAULTS.mutedUsernames,
  };
}

async function persist(state: SettingsPreferencesState) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function SettingsPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [preferences, setPreferences] = React.useState<SettingsPreferencesState>(SETTINGS_DEFAULTS);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!alive) return;
        setPreferences(mergeLoaded(parsed));
      } catch {
        if (!alive) return;
        setPreferences({ ...SETTINGS_DEFAULTS });
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    void syncLeapScheduledNotifications({
      masterEnabled: preferences.notificationsEnabled,
      streakReminders: preferences.streakReminders,
    });
  }, [ready, preferences.notificationsEnabled, preferences.streakReminders]);

  const patch = React.useCallback((partial: Partial<SettingsPreferencesState>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...partial };
      void persist(next);
      return next;
    });
  }, []);

  const replace = React.useCallback((next: SettingsPreferencesState) => {
    setPreferences(next);
    void persist(next);
  }, []);

  const value = React.useMemo(
    () => ({ ready, preferences, patch, replace }),
    [ready, preferences, patch, replace]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function useSettingsPreferences() {
  const ctx = React.useContext(PrefsContext);
  if (!ctx) throw new Error('useSettingsPreferences must be used within SettingsPreferencesProvider');
  return ctx;
}

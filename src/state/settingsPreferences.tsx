import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncLeapScheduledNotifications } from '../services/notifications';
import { useAuth } from './auth';
import { useChallengeWindow } from './challenge';
import { useHasPostedToday } from './posting';

const STORAGE_KEY = 'leap.settings.v4';

export type FeedType = 'mixed' | 'friends';
export type CommentAudience = 'everyone' | 'friends';
// Beta: messaging is open (blocked users excluded) so this is fixed.
export type MessageAudience = 'everyone';

export type SettingsPreferencesState = {
  notificationsEnabled: boolean;
  feedType: FeedType;
  dataSaver: boolean;
  privateAccount: boolean;
  whoCanComment: CommentAudience;
  whoCanMessage: MessageAudience;
  activityStatus: boolean;
  showStreakPublic: boolean;
  showScorePublic: boolean;
  contentFiltering: boolean;
  streakReminders: boolean;
  /** Auto-save new posts to camera roll after a successful post. */
  autoSavePosts: boolean;
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
  dataSaver: false,
  privateAccount: false,
  whoCanComment: 'everyone',
  whoCanMessage: 'everyone',
  activityStatus: true,
  showStreakPublic: true,
  showScorePublic: true,
  contentFiltering: true,
  streakReminders: true,
  autoSavePosts: false,
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
  const o = raw as Partial<SettingsPreferencesState> & {
    autoPlayVideos?: boolean;
    saveToCameraRoll?: boolean;
  };
  const { autoPlayVideos: _removedAutoPlay, ...rest } = o;
  const migratedAutoSave =
    typeof o.autoSavePosts === 'boolean'
      ? o.autoSavePosts
      : typeof o.saveToCameraRoll === 'boolean'
        ? o.saveToCameraRoll
        : SETTINGS_DEFAULTS.autoSavePosts;
  return {
    ...SETTINGS_DEFAULTS,
    ...rest,
    autoSavePosts: migratedAutoSave,
    whoCanMessage: 'everyone',
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
  const { user } = useAuth();
  const win = useChallengeWindow();
  const hasPostedToday = useHasPostedToday(user?.uid, win.dateKey);

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
      hasPostedToday,
    });
  }, [ready, preferences.notificationsEnabled, preferences.streakReminders, hasPostedToday]);

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

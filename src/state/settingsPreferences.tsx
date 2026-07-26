import * as React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { syncLeapScheduledNotifications } from '../services/notifications';
import {
  loadPrivacySettingsFromFirestore,
  mergePrivacyIntoPreferences,
  privacyPatchFromPreferences,
  syncPrivacySettingsToFirestore,
} from '../services/userPrivacySettings';
import { useAuth } from './auth';
import { useChallengeWindow } from './challenge';
import { useHasPostedToday } from './posting';
import { statsDocKeysForLeapDay } from '../lib/leapDayKey';
import { readChallengeCache, writeChallengeCache } from './challengeCache';
import { computeFeedViewingFromNow, nextNyFireUtcMs } from '../utils/nyTime';

const STATS_COLLECTION = 'dailyChallengeStats';

function postedCountFromStats(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const posted = Number(data.postedPostCount);
  if (Number.isFinite(posted) && posted >= 0) return posted;
  const n = Number(data.approvedPostCount);
  if (Number.isFinite(n) && n >= 0) return n;
  const countedPosted = data.countedPostedVideoIds;
  if (countedPosted && typeof countedPosted === 'object' && !Array.isArray(countedPosted)) {
    const keys = Object.keys(countedPosted as Record<string, unknown>).filter((k) =>
      Boolean((countedPosted as Record<string, unknown>)[k])
    );
    if (keys.length > 0) return keys.length;
  }
  const counted = data.countedApprovedVideoIds;
  if (counted && typeof counted === 'object' && !Array.isArray(counted)) {
    const keys = Object.keys(counted as Record<string, unknown>).filter((k) =>
      Boolean((counted as Record<string, unknown>)[k])
    );
    if (keys.length > 0) return keys.length;
  }
  return null;
}

const STORAGE_KEY = 'leap.settings.v4';

export type FeedType = 'mixed' | 'friends';
export type CommentAudience = 'everyone' | 'friends';
export type MessageAudience = 'everyone' | 'friends';

export type SettingsPreferencesState = {
  /** When true, use the dark color palette app-wide. */
  darkMode: boolean;
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
  /** Video ids hidden only for this viewer (e.g. after reporting). */
  hiddenVideoIds: string[];
};

export const SETTINGS_DEFAULTS: SettingsPreferencesState = {
  darkMode: false,
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
  hiddenVideoIds: [],
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
    whoCanMessage:
      o.whoCanMessage === 'friends' ? 'friends' : SETTINGS_DEFAULTS.whoCanMessage,
    blockedUsernames: Array.isArray(o.blockedUsernames)
      ? o.blockedUsernames.map(String)
      : SETTINGS_DEFAULTS.blockedUsernames,
    mutedUsernames: Array.isArray(o.mutedUsernames)
      ? o.mutedUsernames.map(String)
      : SETTINGS_DEFAULTS.mutedUsernames,
    hiddenVideoIds: Array.isArray((o as any).hiddenVideoIds)
      ? (o as any).hiddenVideoIds.map(String)
      : SETTINGS_DEFAULTS.hiddenVideoIds,
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
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());
  const hasPostedToday = useHasPostedToday(user?.uid, viewingChallengeDateKey);
  const [upcomingNoonLeapTitle, setUpcomingNoonLeapTitle] = React.useState<string | null>(null);
  const [todayPostedCount, setTodayPostedCount] = React.useState(0);

  React.useEffect(() => {
    const tNoon = nextNyFireUtcMs(12, 0);
    const { viewingChallengeDateKey: noonDateKey } = computeFeedViewingFromNow(tNoon);
    let alive = true;

    void readChallengeCache(noonDateKey).then((cached) => {
      if (!alive || !cached?.title?.trim()) return;
      setUpcomingNoonLeapTitle(cached.title.trim());
    });

    if (!isFirebaseConfigured()) return () => {
      alive = false;
    };

    const ref = doc(firestore(), 'challenges', noonDateKey);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!alive) return;
        const title = snap.exists() ? String(snap.data()?.title ?? '').trim() : '';
        setUpcomingNoonLeapTitle(title || null);
        if (title) {
          const data = snap.data();
          void writeChallengeCache({
            dateKey: noonDateKey,
            title,
            subtitle: String(data?.subtitle ?? ''),
            maxDurationSeconds: Number(data?.maxDurationSeconds) || 60,
            maxRecordingAttempts: Number(data?.maxRecordingAttempts) || 3,
            allowLibraryAttach: data?.allowLibraryAttach === true,
          });
        }
      },
      () => {
        // keep last known title on listener errors
      }
    );

    return () => {
      alive = false;
      unsub();
    };
  }, [win.dateKey, win.isLive]);

  React.useEffect(() => {
    if (!isFirebaseConfigured()) {
      setTodayPostedCount(0);
      return;
    }

    const statsKeys = statsDocKeysForLeapDay(viewingChallengeDateKey, Date.now());
    if (statsKeys.length === 0) {
      setTodayPostedCount(0);
      return;
    }

    const totals = new Map<string, number>();
    const publish = () => {
      let sum = 0;
      let hasAny = false;
      for (const v of totals.values()) {
        if (Number.isFinite(v) && v >= 0) {
          sum += v;
          hasAny = true;
        }
      }
      setTodayPostedCount(hasAny ? sum : 0);
    };

    const unsubs = statsKeys.map((statsKey) =>
      onSnapshot(
        doc(firestore(), STATS_COLLECTION, statsKey),
        (snap) => {
          const n = postedCountFromStats(
            snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
          );
          if (n != null) totals.set(statsKey, n);
          else totals.delete(statsKey);
          publish();
        },
        () => {
          // keep last known count on listener errors
        }
      )
    );

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [viewingChallengeDateKey, win.dateKey, win.isLive]);

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
    if (!ready || !user?.uid || !isFirebaseConfigured()) return;
    let alive = true;
    void loadPrivacySettingsFromFirestore(user.uid).then((server) => {
      if (!alive || !server) return;
      setPreferences((prev) => {
        const next = mergePrivacyIntoPreferences(prev, server);
        void persist(next);
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [ready, user?.uid]);

  React.useEffect(() => {
    if (!ready) return;
    void syncLeapScheduledNotifications({
      masterEnabled: preferences.notificationsEnabled,
      streakReminders: preferences.streakReminders,
      hasPostedToday,
    });
  }, [
    ready,
    preferences.notificationsEnabled,
    preferences.streakReminders,
    hasPostedToday,
    upcomingNoonLeapTitle,
    todayPostedCount,
  ]);

  const patch = React.useCallback(
    (partial: Partial<SettingsPreferencesState>) => {
      setPreferences((prev) => {
        const next = { ...prev, ...partial };
        void persist(next);
        const privacy = privacyPatchFromPreferences(partial);
        if (user?.uid && privacy) {
          void syncPrivacySettingsToFirestore(user.uid, {
            ...privacy,
            ...(privacy.whoCanMessage
              ? { chatMessageAudience: privacy.whoCanMessage }
              : {}),
          });
        }
        return next;
      });
    },
    [user?.uid]
  );

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

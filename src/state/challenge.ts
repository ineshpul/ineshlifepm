import * as React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import {
  CHALLENGE_INSTRUCTIONS,
  CHALLENGE_PRE_DROP_INSTRUCTIONS,
  CHALLENGE_PRE_DROP_TITLE,
} from '../content/challengeCopy';
import { computeChallengeWindowFromNow } from '../utils/nyTime';

/** Quick-pick lengths in MOD settings; any integer in [MIN, MAX] is allowed when saved. */
export const TASK_DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;
export type TaskDurationSeconds = number;

export const MIN_TASK_DURATION_SECONDS = 10;
export const MAX_TASK_DURATION_SECONDS = 300;

export function normalizeTaskDurationSeconds(raw: unknown): TaskDurationSeconds {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 60;
  return Math.min(MAX_TASK_DURATION_SECONDS, Math.max(MIN_TASK_DURATION_SECONDS, n));
}

export const DEFAULT_MAX_RECORDING_ATTEMPTS = 3;
export const MAX_RECORDING_ATTEMPTS_CAP = 50;

export function normalizeMaxRecordingAttempts(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_MAX_RECORDING_ATTEMPTS;
  return Math.min(MAX_RECORDING_ATTEMPTS_CAP, Math.max(1, n));
}

export type Challenge = {
  dateKey: string; // YYYY-MM-DD (America/New_York)
  title: string;
  subtitle: string;
  maxDurationSeconds: TaskDurationSeconds;
  /** Recording/post tries for that calendar day (default 3). */
  maxRecordingAttempts: number;
};

export type ChallengeWindow = {
  dateKey: string;
  isLive: boolean;
  msUntilDrop: number;
  msUntilExpire: number;
};

/** Title + instruction line shown to players; hides admin-set challenge until noon Eastern. */
export type PlayerFacingChallenge = {
  title: string;
  instructionsLine: string;
  /** False from midnight–noon America/New_York (challenge “drops” at noon). */
  canRecord: boolean;
};

export function getPlayerFacingChallenge(challenge: Challenge, window: ChallengeWindow): PlayerFacingChallenge {
  if (window.isLive) {
    const title = challenge.title.trim();
    return {
      title: title || "Loading today's leap…",
      instructionsLine: `${CHALLENGE_INSTRUCTIONS} · Up to ${challenge.maxDurationSeconds}s`,
      canRecord: true,
    };
  }
  return {
    title: CHALLENGE_PRE_DROP_TITLE,
    instructionsLine: CHALLENGE_PRE_DROP_INSTRUCTIONS,
    canRecord: false,
  };
}

export function useChallengeWindow(): ChallengeWindow {
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, []);

  void tick;
  return computeChallengeWindowFromNow(Date.now());
}

export function useTodayChallenge() {
  const win = useChallengeWindow();
  const [challenge, setChallenge] = React.useState<Challenge>(() => ({
    dateKey: win.dateKey,
    title: '',
    subtitle: '',
    maxDurationSeconds: 60,
    maxRecordingAttempts: DEFAULT_MAX_RECORDING_ATTEMPTS,
  }));

  React.useEffect(() => {
    if (!isFirebaseConfigured()) {
      setChallenge((c) => ({ ...c, dateKey: win.dateKey }));
      return;
    }
    const ref = doc(firestore(), 'challenges', win.dateKey);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data: any = snap.data();
          setChallenge({
            dateKey: win.dateKey,
            title: String(data?.title ?? 'Daily challenge'),
            subtitle: String(data?.subtitle ?? ''),
            maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
            maxRecordingAttempts: normalizeMaxRecordingAttempts(data?.maxRecordingAttempts),
          });
        } else {
          setChallenge({
            dateKey: win.dateKey,
            title: '',
            subtitle: '',
            maxDurationSeconds: 60,
            maxRecordingAttempts: DEFAULT_MAX_RECORDING_ATTEMPTS,
          });
        }
      },
      () => {
        setChallenge({
          dateKey: win.dateKey,
          title: '',
          subtitle: '',
          maxDurationSeconds: 60,
          maxRecordingAttempts: DEFAULT_MAX_RECORDING_ATTEMPTS,
        });
      }
    );
    return () => unsub();
  }, [win.dateKey]);

  return { challenge, window: win };
}

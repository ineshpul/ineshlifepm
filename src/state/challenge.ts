import * as React from 'react';
import { doc, getDoc } from 'firebase/firestore';

import { firestore, isFirebaseConfigured } from '../firebase/firebase';
import { computeChallengeWindowFromNow } from '../utils/nyTime';

/** Allowed task lengths (seconds). Posts use the same value for recording and display. */
export const TASK_DURATION_OPTIONS = [30, 45, 60] as const;
export type TaskDurationSeconds = (typeof TASK_DURATION_OPTIONS)[number];

export function normalizeTaskDurationSeconds(raw: unknown): TaskDurationSeconds {
  const n = Number(raw);
  if (n === 30 || n === 45 || n === 60) return n;
  return 60;
}

export type Challenge = {
  dateKey: string; // YYYY-MM-DD (America/New_York)
  title: string;
  subtitle: string;
  maxDurationSeconds: TaskDurationSeconds;
};

export type ChallengeWindow = {
  dateKey: string;
  isLive: boolean;
  msUntilDrop: number;
  msUntilExpire: number;
};

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
    title: 'Introduce yourself',
    subtitle: 'New challenge dropping soon. Same prompt for everyone. No retakes. No filler.',
    maxDurationSeconds: 60,
  }));

  React.useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!isFirebaseConfigured()) {
        setChallenge((c) => ({ ...c, dateKey: win.dateKey }));
        return;
      }
      try {
        const ref = doc(firestore(), 'challenges', win.dateKey);
        const snap = await getDoc(ref);
        if (!alive) return;
        if (snap.exists()) {
          const data: any = snap.data();
          setChallenge({
            dateKey: win.dateKey,
            title: String(data?.title ?? 'Daily challenge'),
            subtitle: String(data?.subtitle ?? ''),
            maxDurationSeconds: normalizeTaskDurationSeconds(data?.maxDurationSeconds),
          });
        } else {
          setChallenge((c) => ({ ...c, dateKey: win.dateKey }));
        }
      } catch {
        if (!alive) return;
        setChallenge((c) => ({ ...c, dateKey: win.dateKey }));
      }
    };
    run();
    return () => {
      alive = false;
    };
  }, [win.dateKey]);

  return { challenge, window: win };
}

import * as React from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  authAccountCreationMs,
  calendarDaysSinceSignup,
  ensureExperimentCohort,
  incrementExperimentSessionSeconds,
  maybeMarkDayReturn,
  type ExperimentCohort,
} from '../experiments/feedGateExperiment';
import {
  logExperimentEvent,
  setExperimentCohortUserProperty,
} from '../services/nativeAnalytics';
import { useAuth } from '../state/auth';

/**
 * Assigns eligible users to the feed-gate experiment, keeps the Analytics user property
 * in sync, and logs session + day-1/day-7 return events.
 */
export function ExperimentSync() {
  const { user } = useAuth();
  const uid = user?.uid;
  const cohortFromAuth = user?.experimentCohort ?? null;
  const sessionStartedAtRef = React.useRef<number | null>(null);
  const sessionUidRef = React.useRef<string | null>(null);
  const assignAttemptedRef = React.useRef<string | null>(null);

  // Assign cohort for eligible existing users (new signups are assigned in signUp).
  React.useEffect(() => {
    if (!uid) {
      assignAttemptedRef.current = null;
      void setExperimentCohortUserProperty(null);
      return;
    }
    if (cohortFromAuth) {
      void setExperimentCohortUserProperty(cohortFromAuth);
      return;
    }
    if (assignAttemptedRef.current === uid) return;
    assignAttemptedRef.current = uid;
    void ensureExperimentCohort(uid)
      .then((cohort) => {
        if (cohort) void setExperimentCohortUserProperty(cohort);
      })
      .catch(() => {});
  }, [uid, cohortFromAuth]);

  // Re-apply user property whenever cohort is known (every launch / hydrate).
  React.useEffect(() => {
    if (!uid || !cohortFromAuth) return;
    void setExperimentCohortUserProperty(cohortFromAuth);
  }, [uid, cohortFromAuth]);

  // Day-1 / day-7 return relative to Auth account creation.
  React.useEffect(() => {
    if (!uid || !cohortFromAuth) return;
    const createdMs = authAccountCreationMs();
    if (createdMs == null) return;
    const days = calendarDaysSinceSignup(createdMs);
    if (days === 1) {
      void maybeMarkDayReturn(uid, 1).then((fresh) => {
        if (fresh) void logExperimentEvent('day_1_return');
      });
    } else if (days === 7) {
      void maybeMarkDayReturn(uid, 7).then((fresh) => {
        if (fresh) void logExperimentEvent('day_7_return');
      });
    }
  }, [uid, cohortFromAuth]);

  // Session start/end with duration for experiment users.
  React.useEffect(() => {
    if (!uid || !cohortFromAuth) {
      sessionStartedAtRef.current = null;
      sessionUidRef.current = null;
      return;
    }

    const startSession = (cohort: ExperimentCohort) => {
      sessionUidRef.current = uid;
      sessionStartedAtRef.current = Date.now();
      void setExperimentCohortUserProperty(cohort);
      void logExperimentEvent('session_start');
    };

    const endSession = () => {
      const started = sessionStartedAtRef.current;
      const sessionUid = sessionUidRef.current;
      sessionStartedAtRef.current = null;
      if (started == null || !sessionUid) return;
      const durationSeconds = Math.max(0, Math.round((Date.now() - started) / 1000));
      void logExperimentEvent('session_end', { duration_seconds: durationSeconds });
      void incrementExperimentSessionSeconds(sessionUid, durationSeconds);
    };

    startSession(cohortFromAuth);

    const onAppState = (next: AppStateStatus) => {
      if (next === 'active') {
        if (sessionStartedAtRef.current == null) startSession(cohortFromAuth);
        return;
      }
      if (next === 'background' || next === 'inactive') {
        endSession();
      }
    };

    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      endSession();
      sub.remove();
    };
  }, [uid, cohortFromAuth]);

  return null;
}

export function useExperimentCohort(): ExperimentCohort | null {
  const { user } = useAuth();
  return user?.experimentCohort ?? null;
}

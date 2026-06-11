import * as logger from 'firebase-functions/logger';

export type LeapStatsMutationKind =
  | 'incrementUserLeapInches'
  | 'awardLeapInchesOnPending'
  | 'awardLeapInchesOnFullApproval'
  | 'finalizeLeapInchesOnApproval'
  | 'revokeLeapInchesForVideo'
  | 'updateStreakState'
  | 'rebuildStreakFromVideos';

/** Structured log for every inch / streak mutation (grep Cloud Logging for `leapStatsMutation`). */
export function logLeapStatsMutation(payload: {
  kind: LeapStatsMutationKind;
  uid: string;
  videoId?: string;
  dayKey?: string;
  reason: string;
  oldValue?: number | Record<string, unknown> | null;
  newValue?: number | Record<string, unknown> | null;
  delta?: number | null;
  extra?: Record<string, unknown>;
}): void {
  logger.info('leapStatsMutation', {
    kind: payload.kind,
    uid: payload.uid,
    videoId: payload.videoId ?? null,
    dayKey: payload.dayKey ?? null,
    reason: payload.reason,
    oldValue: payload.oldValue ?? null,
    newValue: payload.newValue ?? null,
    delta: payload.delta ?? null,
    ...(payload.extra ?? {}),
  });
}

import * as React from 'react';

import {
  cumulativeLeapInchesFromUser,
  dailyLeapInchesFromUser,
  highestDayLeapInchesFromUser,
  weeklyLeapInchesFromUser,
} from '../../lib/verticalScore';
import { computeFeedViewingFromNow, normalizeNyDateKey, nySundayWeekStartKey } from '../../utils/nyTime';

export type ProfileVideoLike = {
  challengeDate: string;
  moderationStatus: string;
};

export function useProfileStats(
  profile: Record<string, unknown> | undefined,
  videos: ProfileVideoLike[]
) {
  const weekKey = nySundayWeekStartKey(Date.now());
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());

  const allTimeIn = cumulativeLeapInchesFromUser(profile);
  const dailyLeapIn = dailyLeapInchesFromUser(profile);
  const weeklyLeapIn = weeklyLeapInchesFromUser(profile, weekKey);
  const highestDayIn = highestDayLeapInchesFromUser(profile);
  const streakDays = Math.max(0, Math.floor(Number(profile?.activeLeapStreakDays ?? 0)));

  const hasPostedTodayLeap = React.useMemo(
    () =>
      videos.some(
        (v) => normalizeNyDateKey(v.challengeDate, viewingChallengeDateKey) === viewingChallengeDateKey
      ),
    [videos, viewingChallengeDateKey]
  );

  const bestPostId = String(profile?.bestVerticalGainPostId ?? '').trim() || null;

  return {
    weekKey,
    viewingChallengeDateKey,
    allTimeIn,
    dailyLeapIn,
    weeklyLeapIn,
    highestDayIn,
    streakDays,
    hasPostedTodayLeap,
    bestPostId,
  };
}

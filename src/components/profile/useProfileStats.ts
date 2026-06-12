import * as React from 'react';

import {
  activeLeapStreakForDisplay,
  bestVerticalGainPostIdFromProfileVideos,
  dailyLeapInchesFromProfileVideos,
  highestDayLeapInchesFromProfileVideos,
  weeklyLeapInchesFromProfileVideos,
  type ProfileLeapVideo,
} from '../../lib/profileLeapStats';
import {
  cumulativeLeapInchesFromUser,
  dailyLeapInchesFromUser,
  highestDayLeapInchesFromUser,
  weeklyLeapInchesFromUser,
} from '../../lib/verticalScore';
import { getCurrentWeekKey } from '../../lib/getCurrentWeekKey';
import { computeFeedViewingFromNow, normalizeNyDateKey } from '../../utils/nyTime';

export type ProfileVideoLike = ProfileLeapVideo;

export function useProfileStats(
  profile: Record<string, unknown> | undefined,
  videos: ProfileVideoLike[]
) {
  const weekKey = getCurrentWeekKey(new Date(), 'America/New_York');
  const { viewingChallengeDateKey } = computeFeedViewingFromNow(Date.now());

  const allTimeIn = cumulativeLeapInchesFromUser(profile);
  const dailyFromVideos = dailyLeapInchesFromProfileVideos(videos, viewingChallengeDateKey);
  const weeklyFromVideos = weeklyLeapInchesFromProfileVideos(videos, weekKey);
  const dailyLeapIn = Math.max(
    dailyFromVideos,
    dailyLeapInchesFromUser(profile, viewingChallengeDateKey)
  );
  const weeklyLeapIn = Math.max(weeklyFromVideos, weeklyLeapInchesFromUser(profile, weekKey));
  const highestFromVideos = highestDayLeapInchesFromProfileVideos(videos);
  const highestDayIn = Math.max(highestDayLeapInchesFromUser(profile), highestFromVideos);
  const streakDays = activeLeapStreakForDisplay({
    profile,
    videos,
    todayLeapDayKey: viewingChallengeDateKey,
  });

  const hasPostedTodayLeap = React.useMemo(
    () =>
      videos.some(
        (v) => normalizeNyDateKey(v.challengeDate, viewingChallengeDateKey) === viewingChallengeDateKey
      ),
    [videos, viewingChallengeDateKey]
  );

  const bestPostId = React.useMemo(() => {
    const fromProfile = String(profile?.bestVerticalGainPostId ?? '').trim();
    if (fromProfile) return fromProfile;
    return bestVerticalGainPostIdFromProfileVideos(videos);
  }, [profile?.bestVerticalGainPostId, videos]);

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

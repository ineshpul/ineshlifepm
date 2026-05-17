/** Leap inches scoring types (client). */

export type PostLeapInchesInput = {
  streakDays: number;
  isFirstEverLeap: boolean;
  isFirstPostOfDay: boolean;
  likes: number;
  comments: number;
  shares: number;
  views: number;
};

export type PostLeapInchesBreakdown = {
  baseInches: number;
  streakMultiplier: number;
  baseAfterStreak: number;
  engagementInches: number;
  leapInches: number;
};

export type LeapStatsRecomputeResult = {
  leaperLifetimePoints: number;
  leaperDayPoints: number;
  leaperWeekPoints: number;
  highestDayLeapInches: number;
  activeLeapStreakDays: number;
};

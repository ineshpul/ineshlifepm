/** Leap inches scoring types (server). */

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

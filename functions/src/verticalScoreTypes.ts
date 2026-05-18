/** Leap inches scoring types (server). */

export type PostLeapInchesInput = {
  streakDays: number;
  isFirstEverLeap: boolean;
  /** Global first approved leap on this challenge day. */
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

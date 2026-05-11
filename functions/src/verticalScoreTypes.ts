/**
 * Keep in sync with `src/types/verticalScore.ts` (Expo app).
 * Functions bundle cannot import from the app tree.
 */
export type PostMetricsSnapshot = {
  postId: string;
  ownerId: string;
  createdAtMs: number;
  /** Leap day key on the video doc (`challengeDate`). */
  challengeDate?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reports: number;
  deleted: boolean;
  challengeCompleted: boolean;
  verticalXP?: number;
};

export type PostVerticalXpInput = {
  likes: number;
  uniqueComments: number;
  commentCountFallback: number;
  shares: number;
  saves: number;
  reports: number;
  uniqueViews?: number;
  storedViews?: number;
  views?: number;
  challengeDifficulty?: number;
  activeLeapStreakDays: number;
  suspiciousActivityPenalty?: number;
  /** Set at award time; 0 when not applicable. */
  firstLeapBonusXP?: number;
  firstPostOfDayBonusXP?: number;
};

export type PostVerticalXpBreakdown = {
  approvalXP: number;
  difficultyXP: number;
  qualityXP: number;
  engagementXP: number;
  streakBonusXP: number;
  firstLeapBonusXP: number;
  firstPostOfDayBonusXP: number;
  penaltyXP: number;
  qualityScore: number;
  engagementUnits: number;
  weightedEngagementRate: number;
  challengeDifficultyUsed: number;
  postVerticalXP: number;
};

export type VerticalScoreBreakdownFirestore = {
  lifetimePower: number;
  streakPower: number;
  recentQualityPower: number;
  inactivityDecay: number;
  safetyPenalty: number;
  lifetimeVerticalXP: number;
  activeLeapStreakDays: number;
  recentQualityAvg: number;
};

export type VerticalScoreComputationResult = {
  verticalScore: number;
  breakdown: VerticalScoreBreakdownFirestore;
};

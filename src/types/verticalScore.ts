/**
 * Firestore `users/{uid}` — live Vertical Score breakdown (replaces legacy consistency/engagement pillars).
 */
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

/** Normalized snapshot for legacy helpers / marginal stubs (rolling window no longer drives score). */
export type PostMetricsSnapshot = {
  postId: string;
  ownerId: string;
  createdAtMs: number;
  challengeDate?: string;
  views: number;
  likes: number;
  /** Distinct non–self commenters (each user counts once toward engagement). */
  comments: number;
  shares: number;
  saves: number;
  reports: number;
  deleted: boolean;
  challengeCompleted: boolean;
  /** When set (after XP award), used for “Highest leap” instead of leave-one-out marginal. */
  verticalXP?: number;
};

export type VerticalScoreComputationResult = {
  verticalScore: number;
  breakdown: VerticalScoreBreakdownFirestore;
};

/** Inputs for per-post XP (pure layer). */
export type PostVerticalXpInput = {
  likes: number;
  uniqueComments: number;
  /** Used when unique commenter count is unavailable. */
  commentCountFallback: number;
  shares: number;
  saves: number;
  reports: number;
  uniqueViews?: number;
  storedViews?: number;
  views?: number;
  challengeDifficulty?: number;
  activeLeapStreakDays: number;
  /** Optional extra penalty (e.g. fraud flags already on the post). */
  suspiciousActivityPenalty?: number;
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

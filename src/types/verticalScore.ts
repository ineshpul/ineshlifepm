/**
 * Firestore `users/{uid}` fields written by `recomputeVerticalScoreForUser` (client, owner-only)
 * or Cloud Functions (cross-user engagement). Metrics are read from `videos/{postId}` and subcollections.
 */
export type VerticalScoreBreakdownFirestore = {
  consistency: number;
  engagement: number;
  reliability: number;
  bonus: number;
};

/** Normalized snapshot used by the pure scoring function. */
export type PostMetricsSnapshot = {
  postId: string;
  ownerId: string;
  createdAtMs: number;
  views: number;
  likes: number;
  /** Distinct non–self commenters (each user counts once toward engagement). */
  comments: number;
  shares: number;
  saves: number;
  reports: number;
  deleted: boolean;
  challengeCompleted: boolean;
};

export type VerticalScoreComputationResult = {
  verticalScore: number;
  breakdown: VerticalScoreBreakdownFirestore;
};

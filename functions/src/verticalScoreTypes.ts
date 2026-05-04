export type PostMetricsSnapshot = {
  postId: string;
  ownerId: string;
  createdAtMs: number;
  views: number;
  likes: number;
  /** Distinct non–self commenters (each uid counts once). */
  comments: number;
  shares: number;
  saves: number;
  reports: number;
  deleted: boolean;
  challengeCompleted: boolean;
};

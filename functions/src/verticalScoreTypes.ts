export type PostMetricsSnapshot = {
  postId: string;
  ownerId: string;
  createdAtMs: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reports: number;
  deleted: boolean;
  challengeCompleted: boolean;
};

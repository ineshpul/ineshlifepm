export type VideoComment = {
  id: string;
  uid: string;
  username: string;
  text: string;
  at: number;
  replyToCommentId?: string;
  replyToUsername?: string;
  replyPreview?: string;
};

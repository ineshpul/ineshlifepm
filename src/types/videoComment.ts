export type CommentMentionRef = {
  uid: string;
  username: string;
};

export type VideoComment = {
  id: string;
  uid: string;
  username: string;
  text: string;
  at: number;
  replyToCommentId?: string;
  replyToUid?: string;
  replyToUsername?: string;
  replyPreview?: string;
  mentionedUsers?: CommentMentionRef[];
};

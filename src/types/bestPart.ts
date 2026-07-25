/** One “best part of your day” moment — separate from leap `videos`. */

export type BestPartMediaType = 'photo' | 'video';

export type BestPartDoc = {
  uid: string;
  username: string;
  photoUrl?: string;
  /** NY calendar day `YYYY-MM-DD` (not leap noon key). */
  dateKey: string;
  caption: string;
  mediaType: BestPartMediaType;
  url: string;
  storagePath: string;
  durationSeconds?: number;
  isPrivate: boolean;
  deleted: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type BestPartPost = BestPartDoc & { id: string };

export const BEST_PART_MAX_CAPTION = 280;
export const BEST_PART_MAX_VIDEO_SECONDS = 30;
export const BEST_PART_COLLECTION = 'bestParts';

export function bestPartDocId(uid: string, dateKey: string): string {
  return `${uid}_${dateKey}`;
}

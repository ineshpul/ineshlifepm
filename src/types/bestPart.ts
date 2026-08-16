/** One “best part of your day” moment — separate from leap `videos`. */

export type BestPartMediaType = 'photo' | 'video';

export type BestPartDoc = {
  uid: string;
  username: string;
  photoUrl?: string;
  /** NY calendar day `YYYY-MM-DD` (not leap noon key). */
  dateKey: string;
  caption: string;
  /** Normalized hashtags from caption (lowercase, no `#`), max 12. */
  hashtags?: string[];
  mediaType: BestPartMediaType;
  url: string;
  storagePath: string;
  /** 720p feed derivative (preferred for playback when present). */
  feedUrl?: string;
  feedStoragePath?: string;
  /** Generated still used for video previews. */
  posterUrl?: string;
  /** Optional BeReal-style PIP companion (dual-camera photo or video). */
  secondaryUrl?: string;
  secondaryStoragePath?: string;
  feedSecondaryUrl?: string;
  feedSecondaryStoragePath?: string;
  feedEncodeVersion?: string;
  dualFrontIsPrimary?: boolean;
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

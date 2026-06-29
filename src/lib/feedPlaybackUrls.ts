import type { PendingFeedPlayback } from '../state/backgroundPostUpload';

export type FeedPlaybackUrls = {
  url: string;
  secondaryUrl?: string;
  dualFrontIsPrimary?: boolean;
};

/** Prefer staged local clips for a just-posted video so the feed never re-downloads from Storage. */
export function resolveFeedPlaybackUrls(
  item: { id: string; url: string; secondaryUrl?: string; dualFrontIsPrimary?: boolean },
  pending: PendingFeedPlayback | null
): FeedPlaybackUrls {
  if (!pending || item.id !== pending.videoDocId) {
    return {
      url: item.url,
      secondaryUrl: item.secondaryUrl,
      dualFrontIsPrimary: item.dualFrontIsPrimary,
    };
  }
  return {
    url: pending.clipUri,
    secondaryUrl: pending.secondaryClipUri ?? undefined,
    dualFrontIsPrimary: pending.dualFrontIsPrimary,
  };
}

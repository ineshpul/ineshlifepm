import type { PendingFeedPlayback } from '../state/backgroundPostUpload';

export type FeedPlaybackUrls = {
  url: string;
  secondaryUrl?: string;
  dualFrontIsPrimary?: boolean;
};

export type FeedPlaybackSource = {
  id: string;
  url: string;
  secondaryUrl?: string;
  /** Moov-at-front remux for progressive Storage MP4s (preferred when present). */
  feedUrl?: string;
  feedSecondaryUrl?: string;
  dualFrontIsPrimary?: boolean;
};

/**
 * Resolve what the feed should play.
 * 1) Just-posted local staged URIs (instant)
 * 2) Faststart remux URLs when Cloud Function finished
 * 3) Raw Storage download URLs (legacy / in-flight)
 */
export function resolveFeedPlaybackUrls(
  item: FeedPlaybackSource,
  pending: PendingFeedPlayback | null
): FeedPlaybackUrls {
  if (pending && item.id === pending.videoDocId) {
    return {
      url: pending.clipUri,
      secondaryUrl: pending.secondaryClipUri ?? undefined,
      dualFrontIsPrimary: pending.dualFrontIsPrimary,
    };
  }

  const feedUrl = String(item.feedUrl ?? '').trim();
  const feedSecondaryUrl = String(item.feedSecondaryUrl ?? '').trim();
  const rawUrl = String(item.url ?? '').trim();
  const rawSecondary = String(item.secondaryUrl ?? '').trim();

  return {
    url: feedUrl || rawUrl,
    secondaryUrl: feedSecondaryUrl || rawSecondary || undefined,
    dualFrontIsPrimary: item.dualFrontIsPrimary,
  };
}

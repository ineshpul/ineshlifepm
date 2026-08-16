import { nyDateKey } from '../utils/nyTime';

export type BestPartTabSegment = 'mine' | 'community';

export type BestPartTabSession = {
  segment: BestPartTabSegment;
  communityDateKey: string;
  scrollOffset: number;
  /** Last in-view community/mine card — resume autoplay here. */
  focusBestPartId: string | null;
};

let session: BestPartTabSession = {
  segment: 'mine',
  communityDateKey: nyDateKey(),
  scrollOffset: 0,
  focusBestPartId: null,
};

export function readBestPartTabSession(): BestPartTabSession {
  return session;
}

export function patchBestPartTabSession(patch: Partial<BestPartTabSession>): void {
  session = { ...session, ...patch };
}

/** Tapping the Best tab while already on Best — Mine from top (product default). */
export function resetBestPartTabSessionToMine(): void {
  session = {
    segment: 'mine',
    communityDateKey: nyDateKey(),
    scrollOffset: 0,
    focusBestPartId: null,
  };
}

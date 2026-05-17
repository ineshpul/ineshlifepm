import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export type BackfillAllLeapStatsResult = {
  processed: number;
  failedCount: number;
  failedUids: string[];
  pages: number;
  done: boolean;
};

type BackfillBatchResult = {
  processed: number;
  failedUids: string[];
  nextCursorUid: string | null;
  done: boolean;
};

function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: unknown };
    const code = String(e.code ?? '').replace(/^functions\//u, '');
    const msg = String(e.message ?? '').trim();
    if (msg && msg !== 'internal') return msg;
    if (code === 'deadline-exceeded') {
      return 'The server took too long. Try again — batches run automatically.';
    }
    if (code === 'permission-denied') return 'Admin access required.';
    if (code) return code;
  }
  return 'Something went wrong. Check your connection and try again.';
}

/**
 * Admin-only: recompute every user’s leap stats in batches (avoids client callable timeout).
 */
export async function backfillAllUsersLeapStats(
  onProgress?: (p: { processed: number; pages: number }) => void
): Promise<BackfillAllLeapStatsResult> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const fn = httpsCallable<
    { cursorUid?: string; limit?: number },
    BackfillBatchResult
  >(firebaseFunctions(), 'backfillVerticalScoresCallable');

  let cursorUid = '';
  let processed = 0;
  const failedUids: string[] = [];
  let pages = 0;

  for (;;) {
    pages += 1;
    let data: BackfillBatchResult;
    try {
      const res = await fn({
        cursorUid: cursorUid || undefined,
        limit: 12,
      });
      data = res.data;
    } catch (e) {
      throw new Error(callableErrorMessage(e));
    }

    processed += data.processed;
    failedUids.push(...(data.failedUids ?? []));
    onProgress?.({ processed, pages });

    if (data.done) break;
    const next = String(data.nextCursorUid ?? '').trim();
    if (!next || next === cursorUid) break;
    cursorUid = next;
    if (pages > 500) break;
  }

  return {
    processed,
    failedCount: failedUids.length,
    failedUids: failedUids.slice(0, 40),
    pages,
    done: true,
  };
}

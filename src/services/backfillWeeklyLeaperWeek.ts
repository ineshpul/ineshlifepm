import { httpsCallable } from 'firebase/functions';

import { firebaseFunctions, isFirebaseConfigured } from '../firebase/firebase';

export type BackfillWeeklyLeaperWeekResult = {
  ok: boolean;
  dryRun: boolean;
  weekKey: string;
  examined: number;
  updated: number;
  failed: number;
  lastUserId: string;
  nextCursorUserId: string;
  done: boolean;
};

function callableErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string };
    const code = String(e.code ?? '').replace(/^functions\//u, '');
    const msg = String(e.message ?? '').trim();
    if (msg && msg !== 'internal') return msg;
    if (code === 'permission-denied') return 'Admin access required.';
    if (code) return code;
  }
  return 'Something went wrong. Check your connection and try again.';
}

/** Admin-only: recompute `leaperWeekKey` / `leaperWeekPoints` for every user (paginated). */
export async function backfillAllUsersWeeklyLeaperFields(
  onProgress?: (p: { examined: number; updated: number; failed: number; pages: number; weekKey: string }) => void
): Promise<{ examined: number; updated: number; failed: number; pages: number; weekKey: string }> {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }

  const fn = httpsCallable<
    { dryRun?: boolean; cursorUserId?: string; limit?: number },
    BackfillWeeklyLeaperWeekResult
  >(firebaseFunctions(), 'backfillWeeklyLeaperWeekCallable');

  let cursorUserId = '';
  let examined = 0;
  let updated = 0;
  let failed = 0;
  let weekKey = '';
  let pages = 0;

  for (;;) {
    pages += 1;
    let data: BackfillWeeklyLeaperWeekResult;
    try {
      const res = await fn({
        dryRun: false,
        cursorUserId: cursorUserId || undefined,
        limit: 50,
      });
      data = res.data;
    } catch (e) {
      throw new Error(callableErrorMessage(e));
    }

    examined += data.examined;
    updated += data.updated;
    failed += data.failed;
    weekKey = data.weekKey || weekKey;
    onProgress?.({ examined, updated, failed, pages, weekKey });

    if (data.done) break;
    const next = String(data.nextCursorUserId ?? '').trim();
    if (!next || next === cursorUserId) break;
    cursorUserId = next;
    if (pages > 500) break;
  }

  return { examined, updated, failed, pages, weekKey };
}

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';

import { firestore } from '../firebase/firebase';
import { getCurrentWeekKey, isWeekKeySunday, normalizeWeekKey } from './getCurrentWeekKey';

const SAMPLE_LIMIT = 3;

/**
 * Temporary debug: compare the week key used for queries vs values on user docs.
 */
export async function logWeeklyLeaperboardWeekKeyDebug(): Promise<void> {
  const now = new Date();
  const currentWeekKey = getCurrentWeekKey(now, 'America/New_York');
  const wk = normalizeWeekKey(currentWeekKey);

  const keyIsSunday = isWeekKeySunday(wk);
  // eslint-disable-next-line no-console
  console.log('[weekly leaperboard] currentWeekKey (query filter):', JSON.stringify(wk), {
    isSunday: keyIsSunday,
    nyNow: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
  });
  if (!keyIsSunday) {
    // eslint-disable-next-line no-console
    console.warn('[weekly leaperboard] currentWeekKey is NOT a Sunday — week key logic bug');
  }

  try {
    const snap = await getDocs(
      query(collection(firestore(), 'users'), orderBy('leaperWeekPoints', 'desc'), limit(20))
    );
    const samples = snap.docs
      .filter((d) => Number(d.data().leaperWeekPoints ?? 0) > 0)
      .slice(0, SAMPLE_LIMIT)
      .map((d) => {
        const data = d.data();
        const raw = String(data.leaperWeekKey ?? '');
        const normalized = normalizeWeekKey(raw);
        return {
          uid: d.id,
          leaperWeekKeyRaw: raw,
          leaperWeekKeyNormalized: normalized,
          leaperWeekPoints: data.leaperWeekPoints,
          matchesQuery: normalized === wk,
        };
      });

    // eslint-disable-next-line no-console
    console.log('[weekly leaperboard] sample user docs:', JSON.stringify(samples, null, 2));

    const anyMatch = samples.some((s) => s.matchesQuery);
    if (samples.length > 0 && !anyMatch) {
      // eslint-disable-next-line no-console
      console.warn(
        '[weekly leaperboard] MISMATCH: query key does not match any sampled leaperWeekKey — re-run Recompute weekly in Admin.'
      );
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[weekly leaperboard] could not load sample users', e);
  }
}

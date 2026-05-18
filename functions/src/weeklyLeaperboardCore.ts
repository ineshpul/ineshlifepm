import type * as admin from 'firebase-admin';

import { isAwardedLeapVideo, leapInchesFromVideo } from './verticalScoreEngine';
import {
  challengeDateBelongsToWeek,
  getCurrentWeekKeyFromMs,
  getPriorWeekKey,
  leapWeekChallengeDateKeys,
  normalizeWeekKey,
} from './getCurrentWeekKey';
import { challengeDateKeysForFirestoreIn, challengeDateQueryVariants } from './timeKeys';

const normalizeNyDateKey = normalizeWeekKey;

export type WeeklyLeaperboardRow = {
  uid: string;
  score: number;
  username: string;
};

function mergeRows(lists: WeeklyLeaperboardRow[][]): WeeklyLeaperboardRow[] {
  const byUid = new Map<string, WeeklyLeaperboardRow>();
  for (const list of lists) {
    for (const row of list) {
      const prev = byUid.get(row.uid);
      if (!prev || row.score > prev.score) {
        byUid.set(row.uid, { ...row });
      } else if (!prev.username && row.username) {
        prev.username = row.username;
      }
    }
  }
  return Array.from(byUid.values())
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function rowsFromUsers(
  db: admin.firestore.Firestore,
  weekKey: string
): Promise<WeeklyLeaperboardRow[]> {
  const rows: WeeklyLeaperboardRow[] = [];

  try {
    const keyed = await db
      .collection('users')
      .where('leaperWeekKey', '==', weekKey)
      .orderBy('leaperWeekPoints', 'desc')
      .limit(100)
      .get();
    keyed.docs.forEach((d) => {
      const data = d.data();
      const storedKey = normalizeNyDateKey(String(data.leaperWeekKey ?? ''));
      if (storedKey && storedKey !== weekKey) return;
      const score = Number(data.leaperWeekPoints ?? 0);
      if (!Number.isFinite(score) || score <= 0) return;
      rows.push({
        uid: d.id,
        score: Math.round(score * 10) / 10,
        username: String(data.username ?? 'user').trim() || 'user',
      });
    });
  } catch {
    /* composite index */
  }

  if (rows.length > 0) return rows;

  try {
    const broad = await db
      .collection('users')
      .orderBy('leaperWeekPoints', 'desc')
      .limit(150)
      .get();
    broad.docs.forEach((d) => {
      const data = d.data();
      const storedKey = normalizeNyDateKey(String(data.leaperWeekKey ?? ''));
      if (storedKey && storedKey !== weekKey) return;
      const score = Number(data.leaperWeekPoints ?? 0);
      if (!Number.isFinite(score) || score <= 0) return;
      rows.push({
        uid: d.id,
        score: Math.round(score * 10) / 10,
        username: String(data.username ?? 'user').trim() || 'user',
      });
    });
  } catch {
    /* ignore */
  }

  return rows;
}

async function rowsForLeapDay(
  db: admin.firestore.Firestore,
  dayKey: string
): Promise<WeeklyLeaperboardRow[]> {
  const dayNorm = normalizeNyDateKey(dayKey);
  if (!dayNorm) return [];

  const byUid = new Map<string, WeeklyLeaperboardRow>();
  const seen = new Set<string>();

  for (const variant of challengeDateQueryVariants(dayNorm)) {
    const snap = await db
      .collection('videos')
      .where('challengeDate', '==', variant)
      .where('moderationStatus', '==', 'approved')
      .get();

    snap.docs.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);

      const data = d.data() as Record<string, unknown>;
      if (data.deleted === true) return;
      const status = String(data.moderationStatus ?? '').trim().toLowerCase();
      if (status === 'nulled' || status === 'rejected' || status === 'pending') return;

      const cd = normalizeNyDateKey(String(data.challengeDate ?? ''));
      if (cd !== dayNorm) return;

      const inch = leapInchesFromVideo(data);
      if (inch <= 0 && !isAwardedLeapVideo(data)) return;
      if (inch <= 0) return;

      const uid = String(data.uid ?? '').trim();
      if (!uid) return;
      const username = String(data.username ?? 'user').trim() || 'user';
      const prev = byUid.get(uid);
      if (prev) {
        prev.score = Math.round((prev.score + inch) * 10) / 10;
      } else {
        byUid.set(uid, { uid, score: inch, username });
      }
    });
  }

  return Array.from(byUid.values());
}

/** Sum approved leap inches for the leap week (Sun noon ET → next Sun noon ET). */
async function rowsFromVideos(
  db: admin.firestore.Firestore,
  weekKey: string
): Promise<WeeklyLeaperboardRow[]> {
  const wk = normalizeNyDateKey(weekKey);
  if (!wk) return [];

  const byUid = new Map<string, WeeklyLeaperboardRow>();
  const leapDays = leapWeekChallengeDateKeys(wk);
  const inKeys = challengeDateKeysForFirestoreIn(leapDays);

  if (inKeys.length > 0) {
    try {
      const snap = await db
        .collection('videos')
        .where('challengeDate', 'in', inKeys)
        .where('moderationStatus', '==', 'approved')
        .get();

      snap.docs.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        if (data.deleted === true) return;
        const cd = normalizeNyDateKey(String(data.challengeDate ?? ''));
        if (!challengeDateBelongsToWeek(cd, wk)) return;
        const inch = leapInchesFromVideo(data);
        if (inch <= 0 && !isAwardedLeapVideo(data)) return;
        if (inch <= 0) return;
        const uid = String(data.uid ?? '').trim();
        if (!uid) return;
        const username = String(data.username ?? 'user').trim() || 'user';
        const prev = byUid.get(uid);
        if (prev) {
          prev.score = Math.round((prev.score + inch) * 10) / 10;
          if (!prev.username && username) prev.username = username;
        } else {
          byUid.set(uid, { uid, score: inch, username });
        }
      });
    } catch {
      /* per-day fallback */
    }
  }

  if (byUid.size > 0) return Array.from(byUid.values());

  for (const dayKey of leapDays) {
    let dayRows: WeeklyLeaperboardRow[] = [];
    try {
      dayRows = await rowsForLeapDay(db, dayKey);
    } catch {
      dayRows = [];
    }
    for (const row of dayRows) {
      const prev = byUid.get(row.uid);
      if (prev) {
        prev.score = Math.round((prev.score + row.score) * 10) / 10;
        if (!prev.username && row.username) prev.username = row.username;
      } else {
        byUid.set(row.uid, { ...row });
      }
    }
  }

  return Array.from(byUid.values());
}

/** Weekly leaperboard for the leap week containing `nowMs` (or explicit `weekStartKey`). */
export async function buildWeeklyLeaperboard(
  db: admin.firestore.Firestore,
  opts?: { weekStartKey?: string; nowMs?: number }
): Promise<{ weekKey: string; priorWeekKey: string | null; rows: WeeklyLeaperboardRow[] }> {
  const nowMs = opts?.nowMs ?? Date.now();
  const weekKey = normalizeWeekKey(opts?.weekStartKey ?? '') || getCurrentWeekKeyFromMs(nowMs);
  const priorWeekKey = getPriorWeekKey(weekKey);

  const rows = await rowsFromUsers(db, weekKey);

  return { weekKey, priorWeekKey, rows };
}

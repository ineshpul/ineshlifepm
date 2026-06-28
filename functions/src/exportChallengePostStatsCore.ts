import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';

import { countApprovedVideosForDay, reconcileApprovedPostCountForLeapDay } from './dailyChallengeStatsPosts';
import { DAILY_CHALLENGE_STATS_COLLECTION } from './verticalXpBonuses';

export const CHALLENGE_POST_STATS_CSV_PATH = 'exports/challenge-daily-posts.csv';
export const CHALLENGE_POST_STATS_XLSX_PATH = 'exports/challenge-daily-posts.xlsx';
export const CHALLENGE_POST_STATS_CONFIG_DOC = 'config/challengePostStatsExport';
export const DEFAULT_STORAGE_BUCKET = 'leap-e4cce.firebasestorage.app';

function getStorageBucket(): ReturnType<admin.storage.Storage['bucket']> {
  const bucketName =
    process.env.FIREBASE_STORAGE_BUCKET ||
    admin.app().options.storageBucket ||
    DEFAULT_STORAGE_BUCKET;
  return admin.storage().bucket(String(bucketName));
}

export function challengePostStatsBucket(): ReturnType<admin.storage.Storage['bucket']> {
  return getStorageBucket();
}

export type ChallengePostStatsRow = {
  date: string;
  challengeName: string;
  postCount: number;
  userCount: number;
};

export type ChallengePostStatsExport = {
  rows: ChallengePostStatsRow[];
  csv: Buffer;
  xlsx: Buffer;
  totalPosts: number;
};

function toMillis(v: unknown): number {
  if (v && typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  return 0;
}

function nyCalendarPartsFromUtc(ms: number) {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(ms));
  const [date, time] = s.split(' ');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return { y, mo, d, h, mi };
}

function utcMsForNyWallClock(y: number, mo: number, d: number, hh: number, mm: number): number {
  let t = Date.UTC(y, mo - 1, d, 17, 0, 0);
  for (let i = 0; i < 120; i++) {
    const cur = nyCalendarPartsFromUtc(t);
    if (cur.y === y && cur.mo === mo && cur.d === d && cur.h === hh && cur.mi === mm) {
      return t;
    }
    const targetMidnight = Date.UTC(y, mo - 1, d);
    const curMidnight = Date.UTC(cur.y, cur.mo - 1, cur.d);
    const dayDeltaMs = targetMidnight - curMidnight;
    const timeDeltaMs = ((hh - cur.h) * 60 + (mm - cur.mi)) * 60 * 1000;
    t += dayDeltaMs + timeDeltaMs;
  }
  return Date.now() + 60_000;
}

/** Leap day `YYYY-MM-DD` ends at noon ET on the next NY calendar date. */
export function endOfLeapDayMs(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const nextDayMs = utcMsForNyWallClock(y, mo, d, 12, 0) + 24 * 3600000;
  const next = nyCalendarPartsFromUtc(nextDayMs);
  return utcMsForNyWallClock(next.y, next.mo, next.d, 12, 0);
}

function countUsersAtOrBefore(sortedCreationMs: number[], endMs: number): number {
  let lo = 0;
  let hi = sortedCreationMs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedCreationMs[mid] <= endMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

async function loadUserCreationTimesMs(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth
): Promise<number[]> {
  const byUid = new Map<string, number>();

  let pageToken: string | undefined;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const user of res.users) {
      const ms = Date.parse(user.metadata.creationTime);
      if (Number.isFinite(ms)) byUid.set(user.uid, ms);
    }
    pageToken = res.pageToken;
  } while (pageToken);

  const usersSnap = await db.collection('users').get();
  for (const doc of usersSnap.docs) {
    if (byUid.has(doc.id)) continue;
    const data = doc.data() as Record<string, unknown>;
    const ms = toMillis(data.createdAt) || toMillis(data.updatedAt);
    if (ms > 0) byUid.set(doc.id, ms);
  }

  return Array.from(byUid.values()).sort((a, b) => a - b);
}

export async function loadChallengePostStatsRows(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  opts?: { reconcileDayKey?: string }
): Promise<ChallengePostStatsRow[]> {
  if (opts?.reconcileDayKey) {
    await reconcileApprovedPostCountForLeapDay(db, opts.reconcileDayKey);
  }

  const [challengesSnap, statsSnap, userCreationTimes] = await Promise.all([
    db.collection('challenges').get(),
    db.collection(DAILY_CHALLENGE_STATS_COLLECTION).get(),
    loadUserCreationTimesMs(db, auth),
  ]);

  const statsByDate = new Map<string, number>();
  for (const doc of statsSnap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const count = Number(data.approvedPostCount ?? 0);
    statsByDate.set(doc.id, Number.isFinite(count) ? count : 0);
  }

  const rows: ChallengePostStatsRow[] = [];
  for (const doc of challengesSnap.docs) {
    const dateKey = doc.id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;

    const data = doc.data() as Record<string, unknown>;
    const title = String(data.title ?? '').trim() || '(untitled)';
    let postCount = statsByDate.get(dateKey);
    if (postCount === undefined) {
      postCount = await countApprovedVideosForDay(db, dateKey);
    }

    const endMs = endOfLeapDayMs(dateKey);
    const userCount =
      endMs > 0 ? countUsersAtOrBefore(userCreationTimes, endMs) : userCreationTimes.length;

    rows.push({ date: dateKey, challengeName: title, postCount, userCount });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

export function buildChallengePostStatsCsv(rows: ChallengePostStatsRow[]): Buffer {
  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  const lines = [
    'Date,Challenge Name,# of Posts,# of Users',
    ...rows.map((r) => `${r.date},${escape(r.challengeName)},${r.postCount},${r.userCount}`),
  ];
  return Buffer.from(lines.join('\n'), 'utf8');
}

export function buildChallengePostStatsXlsx(rows: ChallengePostStatsRow[]): Buffer {
  const tableData: (string | number)[][] = [
    ['Date', 'Challenge Name', '# of Posts', '# of Users'],
    ...rows.map((r) => [r.date, r.challengeName, r.postCount, r.userCount]),
  ];

  const wideData: (string | number)[][] = [
    ['Date', ...rows.map((r) => r.date)],
    ['Challenge Name', ...rows.map((r) => r.challengeName)],
    ['# of Posts', ...rows.map((r) => r.postCount)],
    ['# of Users', ...rows.map((r) => r.userCount)],
  ];

  const wb = XLSX.utils.book_new();

  const tableSheet = XLSX.utils.aoa_to_sheet(tableData);
  tableSheet['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, tableSheet, 'Daily Posts');

  const wideSheet = XLSX.utils.aoa_to_sheet(wideData);
  wideSheet['!cols'] = [{ wch: 16 }, ...rows.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, wideSheet, 'By Day (wide)');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function buildChallengePostStatsExport(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  opts?: { reconcileDayKey?: string }
): Promise<ChallengePostStatsExport> {
  const rows = await loadChallengePostStatsRows(db, auth, opts);
  const csv = buildChallengePostStatsCsv(rows);
  const xlsx = buildChallengePostStatsXlsx(rows);
  const totalPosts = rows.reduce((sum, r) => sum + r.postCount, 0);
  return { rows, csv, xlsx, totalPosts };
}

export async function uploadChallengePostStatsExport(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  opts?: { reconcileDayKey?: string; closedLeapDayKey?: string }
): Promise<{
  dayCount: number;
  totalPosts: number;
  csvPath: string;
  xlsxPath: string;
}> {
  const exportData = await buildChallengePostStatsExport(db, auth, {
    reconcileDayKey: opts?.reconcileDayKey,
  });

  const bucket = getStorageBucket();
  const csvFile = bucket.file(CHALLENGE_POST_STATS_CSV_PATH);
  const xlsxFile = bucket.file(CHALLENGE_POST_STATS_XLSX_PATH);

  await Promise.all([
    csvFile.save(exportData.csv, {
      contentType: 'text/csv',
      metadata: { cacheControl: 'no-cache' },
    }),
    xlsxFile.save(exportData.xlsx, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { cacheControl: 'no-cache' },
    }),
  ]);

  await db.doc(CHALLENGE_POST_STATS_CONFIG_DOC).set(
    {
      csvStoragePath: CHALLENGE_POST_STATS_CSV_PATH,
      xlsxStoragePath: CHALLENGE_POST_STATS_XLSX_PATH,
      dayCount: exportData.rows.length,
      totalPosts: exportData.totalPosts,
      closedLeapDayKey: opts?.closedLeapDayKey ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    dayCount: exportData.rows.length,
    totalPosts: exportData.totalPosts,
    csvPath: CHALLENGE_POST_STATS_CSV_PATH,
    xlsxPath: CHALLENGE_POST_STATS_XLSX_PATH,
  };
}

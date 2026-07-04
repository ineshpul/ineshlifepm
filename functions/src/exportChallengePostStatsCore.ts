import * as admin from 'firebase-admin';
import * as XLSX from 'xlsx';

import { reconcileApprovedPostCountForLeapDay } from './dailyChallengeStatsPosts';
import { normalizeWeekKey } from './getCurrentWeekKey';
import { nyDateKeyFromMs } from './timeKeys';

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
  /** null while the calendar day is still open (before 12:05 AM rollover). */
  postCount: number | null;
  userCount: number | null;
  userDelta: number | null;
  isOpen: boolean;
};

export type ChallengePostStatsExport = {
  rows: ChallengePostStatsRow[];
  csv: Buffer;
  xlsx: Buffer;
  totalPosts: number;
  openCalendarDayKey: string;
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

/** End of NY calendar day = last ms before midnight ET on the next date. */
export function endOfCalendarDayMs(dateKey: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return 0;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const nextDayMs = utcMsForNyWallClock(y, mo, d, 0, 0) + 24 * 3600000;
  const next = nyCalendarPartsFromUtc(nextDayMs);
  return utcMsForNyWallClock(next.y, next.mo, next.d, 0, 0) - 1;
}

export function openCalendarDayKeyFromMs(nowMs: number = Date.now()): string {
  return nyDateKeyFromMs(nowMs);
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

/** Count approved, non-deleted videos directly from Firestore (source of truth). */
export async function loadApprovedPostCountsByChallengeDate(
  db: admin.firestore.Firestore
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const snap = await db.collection('videos').where('moderationStatus', '==', 'approved').get();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    if (data.deleted === true) continue;
    const dateKey = normalizeWeekKey(String(data.challengeDate ?? ''));
    if (!dateKey) continue;
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return counts;
}

function cellValue(value: number | null): string | number {
  return value == null ? '' : value;
}

export async function loadChallengePostStatsRows(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  opts?: { reconcileDayKey?: string; nowMs?: number }
): Promise<ChallengePostStatsRow[]> {
  const nowMs = opts?.nowMs ?? Date.now();
  const openDayKey = openCalendarDayKeyFromMs(nowMs);

  if (opts?.reconcileDayKey) {
    await reconcileApprovedPostCountForLeapDay(db, opts.reconcileDayKey);
  }

  const [challengesSnap, postCountsByDate, userCreationTimes] = await Promise.all([
    db.collection('challenges').get(),
    loadApprovedPostCountsByChallengeDate(db),
    loadUserCreationTimesMs(db, auth),
  ]);

  const draftRows: Array<{
    date: string;
    challengeName: string;
    postCount: number | null;
    userCount: number | null;
    isOpen: boolean;
  }> = [];

  for (const doc of challengesSnap.docs) {
    const dateKey = doc.id;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;

    const data = doc.data() as Record<string, unknown>;
    const title = String(data.title ?? '').trim() || '(untitled)';
    const isOpen = dateKey >= openDayKey;

    if (isOpen) {
      draftRows.push({
        date: dateKey,
        challengeName: title,
        postCount: null,
        userCount: null,
        isOpen: true,
      });
      continue;
    }

    const postCount = postCountsByDate.get(dateKey) ?? 0;
    const endMs = endOfCalendarDayMs(dateKey);
    const userCount =
      endMs > 0 ? countUsersAtOrBefore(userCreationTimes, endMs) : userCreationTimes.length;

    draftRows.push({
      date: dateKey,
      challengeName: title,
      postCount,
      userCount,
      isOpen: false,
    });
  }

  draftRows.sort((a, b) => a.date.localeCompare(b.date));

  let prevUserCount: number | null = null;
  const rows: ChallengePostStatsRow[] = draftRows.map((row) => {
    const userDelta =
      row.isOpen || row.userCount == null || prevUserCount == null
        ? null
        : row.userCount - prevUserCount;

    if (!row.isOpen && row.userCount != null) {
      prevUserCount = row.userCount;
    }

    return {
      date: row.date,
      challengeName: row.challengeName,
      postCount: row.postCount,
      userCount: row.userCount,
      userDelta,
      isOpen: row.isOpen,
    };
  });

  return rows;
}

export function buildChallengePostStatsCsv(rows: ChallengePostStatsRow[]): Buffer {
  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };

  const lines = [
    'Date,Challenge Name,# of Posts,# of Users,User Delta',
    ...rows.map(
      (r) =>
        `${r.date},${escape(r.challengeName)},${cellValue(r.postCount)},${cellValue(r.userCount)},${cellValue(r.userDelta)}`
    ),
  ];
  return Buffer.from(lines.join('\n'), 'utf8');
}

export function buildChallengePostStatsXlsx(rows: ChallengePostStatsRow[]): Buffer {
  const tableData: (string | number)[][] = [
    ['Date', 'Challenge Name', '# of Posts', '# of Users', 'User Delta'],
    ...rows.map((r) => [
      r.date,
      r.challengeName,
      cellValue(r.postCount),
      cellValue(r.userCount),
      cellValue(r.userDelta),
    ]),
  ];

  const wideData: (string | number)[][] = [
    ['Date', ...rows.map((r) => r.date)],
    ['Challenge Name', ...rows.map((r) => r.challengeName)],
    ['# of Posts', ...rows.map((r) => cellValue(r.postCount))],
    ['# of Users', ...rows.map((r) => cellValue(r.userCount))],
    ['User Delta', ...rows.map((r) => cellValue(r.userDelta))],
  ];

  const wb = XLSX.utils.book_new();

  const tableSheet = XLSX.utils.aoa_to_sheet(tableData);
  tableSheet['!cols'] = [{ wch: 12 }, { wch: 48 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, tableSheet, 'Daily Posts');

  const wideSheet = XLSX.utils.aoa_to_sheet(wideData);
  wideSheet['!cols'] = [{ wch: 16 }, ...rows.map(() => ({ wch: 14 }))];
  XLSX.utils.book_append_sheet(wb, wideSheet, 'By Day (wide)');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export async function buildChallengePostStatsExport(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  opts?: { reconcileDayKey?: string; nowMs?: number }
): Promise<ChallengePostStatsExport> {
  const nowMs = opts?.nowMs ?? Date.now();
  const rows = await loadChallengePostStatsRows(db, auth, { ...opts, nowMs });
  const csv = buildChallengePostStatsCsv(rows);
  const xlsx = buildChallengePostStatsXlsx(rows);
  const totalPosts = rows.reduce((sum, r) => sum + (r.postCount ?? 0), 0);
  return {
    rows,
    csv,
    xlsx,
    totalPosts,
    openCalendarDayKey: openCalendarDayKeyFromMs(nowMs),
  };
}

export async function uploadChallengePostStatsExport(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  opts?: { reconcileDayKey?: string; closedCalendarDayKey?: string; nowMs?: number }
): Promise<{
  dayCount: number;
  totalPosts: number;
  csvPath: string;
  xlsxPath: string;
  openCalendarDayKey: string;
}> {
  const exportData = await buildChallengePostStatsExport(db, auth, {
    reconcileDayKey: opts?.reconcileDayKey,
    nowMs: opts?.nowMs,
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
      openCalendarDayKey: exportData.openCalendarDayKey,
      closedCalendarDayKey: opts?.closedCalendarDayKey ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    dayCount: exportData.rows.length,
    totalPosts: exportData.totalPosts,
    csvPath: CHALLENGE_POST_STATS_CSV_PATH,
    xlsxPath: CHALLENGE_POST_STATS_XLSX_PATH,
    openCalendarDayKey: exportData.openCalendarDayKey,
  };
}

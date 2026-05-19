/** America/New_York wall-clock helpers (Hermes-safe; avoid parsing `toLocaleString()`). */

export const NY_TIMEZONE = 'America/New_York';

export function nyCalendarPartsFromUtc(ms: number) {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: NY_TIMEZONE,
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

/** UTC instant when the America/New_York wall clock reads y-mo-d at hh:mm (seconds 0). */
export function utcMsForNyWallClock(y: number, mo: number, d: number, hh: number, mm: number): number {
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

/** Next calendar date in NY after y-mo-d (approx. via +25h from local noon). */
export function nextNyCalendarDay(y: number, mo: number, d: number) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0) + 25 * 3600000;
  return nyCalendarPartsFromUtc(t);
}

/** Previous calendar date in NY before y-mo-d (approx. via −25h from local noon). Mirrors {@link nextNyCalendarDay}. */
export function prevNyCalendarDay(y: number, mo: number, d: number) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0) - 25 * 3600000;
  return nyCalendarPartsFromUtc(t);
}

export function nyDateKey(d = new Date()) {
  const { y, mo, d: day } = nyCalendarPartsFromUtc(d.getTime());
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** NY weekday with Sunday = 0 … Saturday = 6. */
function nyWeekdaySun0(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TIMEZONE,
    weekday: 'short',
  }).formatToParts(new Date(ms));
  const w = (parts.find((p) => p.type === 'weekday')?.value ?? 'Sun').replace(/\./g, '').slice(0, 3);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

export {
  challengeDateBelongsToLeapWeek,
  getCurrentWeekKey,
  getCurrentWeekKeyFromMs,
  getCurrentWeekKeyFromMs as nySundayWeekStartKey,
  getPriorWeekKey as prevNySundayWeekStartKey,
  leapWeekChallengeDateKeys as nyLeapWeekChallengeDateKeys,
  msUntilNextWeekReset as msUntilNextNySundayWeekStart,
  normalizeWeekKey,
  weekStartKeyFromChallengeDate as nyLeapWeekStartKeyFromChallengeDate,
} from '../lib/getCurrentWeekKey';

import { calendarWeekDateKeys } from '../lib/getCurrentWeekKey';

/** @see calendarWeekDateKeys in getCurrentWeekKey */
export const nySundayWeekDateKeys = calendarWeekDateKeys;

/** Coerce `YYYY-M-D` / `YYYY-MM-DD` to canonical `YYYY-MM-DD` (invalid → `fallback`). */
export function normalizeNyDateKey(raw: string, fallback: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return fallback;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return fallback;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** NY noon on `dateKey` as UTC ms — larger = newer challenge day (stable sort key). */
export function nyDateKeyToSortUtcMs(dateKey: string, fallbackMs = 0): number {
  const n = normalizeNyDateKey(dateKey, '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n);
  if (!m) return fallbackMs;
  return utcMsForNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0);
}

const safeMax0 = (x: number) => (Number.isFinite(x) ? Math.max(0, x) : 0);

export type NyChallengeWindow = {
  dateKey: string;
  isLive: boolean;
  msUntilDrop: number;
  msUntilExpire: number;
};

/** Noon NY → next midnight NY (start of next calendar day in NY). */
export function computeChallengeWindowFromNow(nowMs: number): NyChallengeWindow {
  const dateKey = nyDateKey(new Date(nowMs));
  const { y, mo, d } = nyCalendarPartsFromUtc(nowMs);
  const dropAt = utcMsForNyWallClock(y, mo, d, 12, 0);
  const next = nextNyCalendarDay(y, mo, d);
  const expireAt = utcMsForNyWallClock(next.y, next.mo, next.d, 0, 0);

  const msUntilDrop = dropAt - nowMs;
  const msUntilExpire = expireAt - nowMs;
  const isLive = msUntilDrop <= 0 && msUntilExpire > 0;

  return {
    dateKey,
    isLive,
    msUntilDrop: safeMax0(msUntilDrop),
    msUntilExpire: safeMax0(msUntilExpire),
  };
}

/**
 * Everyone-feed access is tied to NY **noon-to-noon** challenge cycles (not calendar midnight).
 * `viewingChallengeDateKey` is the `videos/{uid}_{dateKey}` key you must have posted for to watch
 * until the next noon ET boundary (`msUntilNextLock`).
 */
export type FeedViewingWindow = {
  viewingChallengeDateKey: string;
  msUntilNextLock: number;
};

export function computeFeedViewingFromNow(nowMs: number): FeedViewingWindow {
  const { y, mo, d } = nyCalendarPartsFromUtc(nowMs);
  const todayNoon = utcMsForNyWallClock(y, mo, d, 12, 0);

  let vy: number;
  let vm: number;
  let vd: number;
  if (nowMs >= todayNoon) {
    vy = y;
    vm = mo;
    vd = d;
  } else {
    /** Before noon ET: still in “yesterday’s” noon→noon leap — label is the **previous NY calendar date**. */
    const prev = prevNyCalendarDay(y, mo, d);
    vy = prev.y;
    vm = prev.mo;
    vd = prev.d;
  }

  const viewingChallengeDateKey = `${vy}-${String(vm).padStart(2, '0')}-${String(vd).padStart(2, '0')}`;

  const nextDay = nextNyCalendarDay(y, mo, d);
  const nextNoon =
    nowMs < todayNoon ? todayNoon : utcMsForNyWallClock(nextDay.y, nextDay.mo, nextDay.d, 12, 0);

  return {
    viewingChallengeDateKey,
    msUntilNextLock: safeMax0(nextNoon - nowMs),
  };
}

/** Same challenge / "leap" `YYYY-MM-DD` as server `leapChallengeDateKeyFromMs` (noon ET boundaries). */
export function leapChallengeDateKeyFromNow(ms: number): string {
  return computeFeedViewingFromNow(ms).viewingChallengeDateKey;
}

/**
 * Firestore `challenges/{dateKey}` id for moderator publish.
 * While recording is open (noon→midnight ET), matches {@link computeFeedViewingFromNow}.
 * After recording closes until the next noon ET, targets the **upcoming** noon→noon cycle so
 * admins do not write to yesterday’s viewing key.
 */
export function getAdminPublishChallengeDateKey(nowMs: number): string {
  const window = computeChallengeWindowFromNow(nowMs);
  const feed = computeFeedViewingFromNow(nowMs);
  if (window.isLive) {
    return feed.viewingChallengeDateKey;
  }
  const afterNextLock = nowMs + Math.max(1, feed.msUntilNextLock);
  return computeFeedViewingFromNow(afterNextLock).viewingChallengeDateKey;
}

/** Next UTC ms at or after `nowMs + 15s` for NY wall clock hour:minute today or a future NY day. */

/**
 * Firestore `where('challengeDate', 'in', …)` is **exact string** match. Some older posts use
 * `YYYY-M-D` without zero-padding; include both canonical and compact forms (deduped, max 30).
 */
export function challengeDateKeysForFirestoreIn(dateKeys: readonly string[]): string[] {
  const set = new Set<string>();
  for (const raw of dateKeys) {
    const canon = normalizeNyDateKey(String(raw), String(raw));
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canon);
    if (!m) continue;
    set.add(canon);
    set.add(`${Number(m[1])}-${Number(m[2])}-${Number(m[3])}`);
  }
  return Array.from(set).slice(0, 30);
}

const FIRESTORE_IN_MAX = 10;

/**
 * Pack leap day keys into groups so each group's `challengeDate` `in` list stays ≤ 10
 * (Firestore limit; each day uses up to two string variants).
 */
export function groupDayKeysForFirestoreInQuery(dayKeys: readonly string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];
  let inCount = 0;
  for (const dayKey of dayKeys) {
    const vals = challengeDateKeysForFirestoreIn([dayKey]);
    if (vals.length === 0) continue;
    if (inCount + vals.length > FIRESTORE_IN_MAX && current.length > 0) {
      groups.push(current);
      current = [];
      inCount = 0;
    }
    current.push(dayKey);
    inCount += vals.length;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Walk backward along consecutive NY **calendar** dates (newest first). Matches how streaks and
 * `videos.challengeDate` labels advance — **not** `noon−40h`, which skips a calendar day and broke streaks.
 */
export function nyLeapDayChainBackward(fromDateKey: string, count: number): string[] {
  const keys: string[] = [];
  let cur = normalizeNyDateKey(fromDateKey, '');
  if (!cur) return keys;
  for (let i = 0; i < count; i++) {
    keys.push(cur);
    cur = prevNyDateKey(cur);
  }
  return keys;
}

/** Previous `YYYY-MM-DD` label in NY (one calendar day back). Used for streaks and prior-leap UI. */
export function prevNyDateKey(dateKey: string): string {
  const n = normalizeNyDateKey(dateKey, '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n);
  if (!m) return dateKey;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const prev = prevNyCalendarDay(y, mo, d);
  return `${prev.y}-${String(prev.mo).padStart(2, '0')}-${String(prev.d).padStart(2, '0')}`;
}

export function nyRecentChallengeDateKeys(anchorDateKey: string, totalDays: number): string[] {
  const keys: string[] = [];
  const n0 = normalizeNyDateKey(anchorDateKey.trim(), '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n0);
  if (!m || totalDays <= 0) return keys;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]);
  for (let i = 0; i < totalDays; i++) {
    keys.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    const prev = prevNyCalendarDay(y, mo, d);
    y = prev.y;
    mo = prev.mo;
    d = prev.d;
  }
  return keys;
}

/**
 * Build `in` list for `videos.challengeDate` capped at 30 values. Prioritizes the active viewing
 * cycle + the day before so early-morning feeds still match peers’ “yesterday” posts before older
 * days consume the Firestore `in` budget.
 */
export function prioritizedChallengeDateInForVideosQuery(
  anchorKey: string,
  totalDays: number,
  viewingChallengeDateKey: string
): string[] {
  const recent = nyRecentChallengeDateKeys(anchorKey, totalDays);
  const priorityKeys = [
    normalizeNyDateKey(viewingChallengeDateKey, anchorKey),
    prevNyDateKey(viewingChallengeDateKey),
    normalizeNyDateKey(anchorKey, anchorKey),
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  const pushVariants = (dayKey: string) => {
    const canon = normalizeNyDateKey(String(dayKey), String(dayKey));
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canon);
    const variants = m
      ? [canon, `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}`]
      : [String(dayKey).trim()].filter(Boolean);
    for (const v of variants) {
      if (out.length >= 30) return;
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  };
  for (const k of priorityKeys) {
    if (out.length >= 30) break;
    pushVariants(k);
  }
  for (const k of recent) {
    if (out.length >= 30) break;
    pushVariants(k);
  }
  return out;
}

export function nextNyFireUtcMs(hour: number, minute: number, nowMs = Date.now()): number {
  let { y, mo, d } = nyCalendarPartsFromUtc(nowMs);
  for (let i = 0; i < 400; i++) {
    const cand = utcMsForNyWallClock(y, mo, d, hour, minute);
    if (cand > nowMs + 15_000) {
      return cand;
    }
    const anchor = utcMsForNyWallClock(y, mo, d, 12, 0);
    ({ y, mo, d } = nyCalendarPartsFromUtc(anchor + 28 * 3600000));
  }
  return nowMs + 60_000;
}

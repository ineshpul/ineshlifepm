/**
 * Canonical leap-week key (single source of truth).
 * Keep in sync with `src/lib/getCurrentWeekKey.ts` (app bundle).
 *
 * Week window: Sunday 12:00 PM America/New_York → following Sunday 11:59:59 AM ET.
 */

export const NY_LEAP_TIMEZONE = 'America/New_York' as const;

const WEEK_MS = 7 * 86_400_000;

export type NyLeapTimezone = typeof NY_LEAP_TIMEZONE;

function nyCalendarPartsFromUtc(ms: number, timeZone: string) {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
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

function utcMsForNyWallClock(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
  timeZone: string
): number {
  let t = Date.UTC(y, mo - 1, d, 17, 0, 0);
  for (let i = 0; i < 120; i++) {
    const cur = nyCalendarPartsFromUtc(t, timeZone);
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

function prevNyCalendarDay(y: number, mo: number, d: number, timeZone: string) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0, timeZone) - 25 * 3600000;
  return nyCalendarPartsFromUtc(t, timeZone);
}

function nextNyCalendarDay(y: number, mo: number, d: number, timeZone: string) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0, timeZone) + 25 * 3600000;
  return nyCalendarPartsFromUtc(t, timeZone);
}

/** NY weekday at `ms` (Sun=0 … Sat=6). Hermes-safe (handles Sun/Sunday). */
function nyWeekdaySun0(ms: number, timeZone: string): number {
  const label =
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const s = label.replace(/\./g, '').toLowerCase();
  if (s.startsWith('sun')) return 0;
  if (s.startsWith('mon')) return 1;
  if (s.startsWith('tue')) return 2;
  if (s.startsWith('wed')) return 3;
  if (s.startsWith('thu')) return 4;
  if (s.startsWith('fri')) return 5;
  if (s.startsWith('sat')) return 6;
  return 0;
}

/** True when y-mo-d is a Sunday on the America/New_York calendar. */
function isNySundayCalendarDate(y: number, mo: number, d: number, timeZone: string): boolean {
  const noonMs = utcMsForNyWallClock(y, mo, d, 12, 0, timeZone);
  return nyWeekdaySun0(noonMs, timeZone) === 0;
}

function formatWeekKey(y: number, mo: number, d: number): string {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Canonical `YYYY-MM-DD` week key string (zero-padded). */
export function normalizeWeekKey(raw: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(raw ?? '').trim());
  if (!m) return '';
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return '';
  return formatWeekKey(y, mo, d);
}

/** True when `weekKey` is a Sunday in NY (sanity check). */
export function isWeekKeySunday(weekKey: string, timeZone: string = NY_LEAP_TIMEZONE): boolean {
  const n = normalizeWeekKey(weekKey);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n);
  if (!m) return false;
  const noon = utcMsForNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, timeZone);
  return nyWeekdaySun0(noon, timeZone) === 0;
}

/** Walk back `count` NY calendar days from y-mo-d. */
function nyCalendarDaysBack(y: number, mo: number, d: number, count: number, timeZone: string) {
  let cy = y;
  let cm = mo;
  let cd = d;
  for (let i = 0; i < count; i++) {
    const prev = prevNyCalendarDay(cy, cm, cd, timeZone);
    cy = prev.y;
    cm = prev.mo;
    cd = prev.d;
  }
  return { y: cy, mo: cm, d: cd };
}

/**
 * Current leap-week key for `now` in `timezone` (only `America/New_York` supported).
 * Always returns a **Sunday** `YYYY-MM-DD`.
 */
export function getCurrentWeekKey(
  now: Date,
  timezone: NyLeapTimezone = NY_LEAP_TIMEZONE
): string {
  if (timezone !== NY_LEAP_TIMEZONE) {
    throw new Error(`getCurrentWeekKey: only ${NY_LEAP_TIMEZONE} is supported`);
  }
  return getCurrentWeekKeyFromMs(now.getTime(), timezone);
}

function isNySunday(y: number, mo: number, d: number, timeZone: string): boolean {
  const noonMs = utcMsForNyWallClock(y, mo, d, 12, 0, timeZone);
  const weekdayLong = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(new Date(noonMs));
  return weekdayLong.toLowerCase().startsWith('sunday');
}

/**
 * Leap week key: Sunday 12:00 PM ET when the current week opened (`YYYY-MM-DD` in NY).
 */
export function getCurrentWeekKeyFromMs(
  nowMs: number,
  timezone: NyLeapTimezone = NY_LEAP_TIMEZONE
): string {
  if (timezone !== NY_LEAP_TIMEZONE) {
    throw new Error(`getCurrentWeekKeyFromMs: only ${NY_LEAP_TIMEZONE} is supported`);
  }

  let { y, mo, d } = nyCalendarPartsFromUtc(nowMs, timezone);

  for (let i = 0; i < 7; i++) {
    if (isNySunday(y, mo, d, timezone)) {
      const sundayNoonMs = utcMsForNyWallClock(y, mo, d, 12, 0, timezone);
      if (nowMs >= sundayNoonMs) {
        return formatWeekKey(y, mo, d);
      }
      const prevSun = nyCalendarDaysBack(y, mo, d, 7, timezone);
      return formatWeekKey(prevSun.y, prevSun.mo, prevSun.d);
    }
    ({ y, mo, d } = prevNyCalendarDay(y, mo, d, timezone));
  }

  throw new Error('getCurrentWeekKey: could not find Sunday in America/New_York');
}

/** Prior week key (seven NY calendar days before `currentWeekKey`). */
export function getPriorWeekKey(currentWeekKey: string): string | null {
  const n = normalizeWeekKey(currentWeekKey);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n);
  if (!m) return null;
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]);
  for (let i = 0; i < 7; i++) {
    const prev = prevNyCalendarDay(y, mo, d, NY_LEAP_TIMEZONE);
    y = prev.y;
    mo = prev.mo;
    d = prev.d;
  }
  return formatWeekKey(y, mo, d);
}

export function weekKeyToUtcMs(weekStartKey: string): number {
  const n = normalizeWeekKey(weekStartKey);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(n);
  if (!m) return 0;
  return utcMsForNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0, NY_LEAP_TIMEZONE);
}

export function msUntilNextWeekReset(nowMs: number): number {
  const startMs = weekKeyToUtcMs(getCurrentWeekKeyFromMs(nowMs));
  if (startMs <= 0) return 86_400_000;
  return Math.max(1, startMs + WEEK_MS - nowMs);
}

/** Week key for a leap `challengeDate` label (noon-to-noon day). */
export function weekStartKeyFromChallengeDate(challengeDateKey: string): string {
  const raw = String(challengeDateKey ?? '').trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!m) return getCurrentWeekKey(new Date());
  const noon = utcMsForNyWallClock(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    12,
    0,
    NY_LEAP_TIMEZONE
  );
  return getCurrentWeekKeyFromMs(noon);
}

export function challengeDateBelongsToWeek(challengeDateKey: string, weekStartKey: string): boolean {
  const wk = normalizeWeekKey(weekStartKey);
  if (!wk) return false;
  return weekStartKeyFromChallengeDate(challengeDateKey) === wk;
}

/** Leap-day `challengeDate` labels in [weekStart noon ET, next weekStart noon ET). */
export function leapWeekChallengeDateKeys(weekStartKey: string): string[] {
  const wk = normalizeWeekKey(weekStartKey);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wk);
  if (!m) return [];
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]);
  const keys: string[] = [];
  for (let i = 0; i < 8; i++) {
    const dayKey = formatWeekKey(y, mo, d);
    if (weekStartKeyFromChallengeDate(dayKey) !== wk) {
      if (keys.length > 0) break;
    } else {
      keys.push(dayKey);
    }
    const next = nextNyCalendarDay(y, mo, d, NY_LEAP_TIMEZONE);
    y = next.y;
    mo = next.mo;
    d = next.d;
  }
  return keys;
}

/** Sun–Sat NY calendar date labels for the week that launched on `weekStartKey`. */
export function calendarWeekDateKeys(weekStartKey: string): string[] {
  const start = normalizeWeekKey(weekStartKey);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start);
  if (!m) return [];
  let y = Number(m[1]);
  let mo = Number(m[2]);
  let d = Number(m[3]);
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    keys.push(formatWeekKey(y, mo, d));
    const next = nextNyCalendarDay(y, mo, d, NY_LEAP_TIMEZONE);
    y = next.y;
    mo = next.mo;
    d = next.d;
  }
  return keys;
}

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

export function nyDateKey(d = new Date()) {
  const { y, mo, d: day } = nyCalendarPartsFromUtc(d.getTime());
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

/** Next UTC ms at or after `nowMs + 15s` for NY wall clock hour:minute today or a future NY day. */
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

/** America/New_York calendar date `YYYY-MM-DD` (matches app `nyDateKey`). */
export function nyDateKeyFromMs(ms: number): string {
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
  return s;
}

/**
 * Challenge / "leap" day key (noon ET → next noon ET), matches client `computeFeedViewingFromNow`.
 * Daily leaper points must use this so the board matches "today's leap", not calendar midnight.
 */
function prevNyCalendarDay(y: number, mo: number, d: number) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0) - 25 * 3600000;
  return nyCalendarPartsFromUtc(t);
}

export function leapChallengeDateKeyFromMs(ms: number): string {
  const { y, mo, d } = nyCalendarPartsFromUtc(ms);
  const todayNoon = utcMsForNyWallClock(y, mo, d, 12, 0);
  if (ms >= todayNoon) {
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  /** Before noon ET: same label as previous NY calendar date (matches app `computeFeedViewingFromNow`). */
  const prev = prevNyCalendarDay(y, mo, d);
  return `${prev.y}-${String(prev.mo).padStart(2, '0')}-${String(prev.d).padStart(2, '0')}`;
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

function nyWeekdaySun0(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).formatToParts(new Date(ms));
  const w = (parts.find((p) => p.type === 'weekday')?.value ?? 'Sun').replace(/\./g, '').slice(0, 3);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[w] ?? 0;
}

function nextNyCalendarDay(y: number, mo: number, d: number) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0) + 25 * 3600000;
  return nyCalendarPartsFromUtc(t);
}

function prevNySundayWeekStartKey(currentWeekStartKey: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(currentWeekStartKey ?? '').trim());
  if (!m) return null;
  const noon = utcMsForNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0);
  return nyCalendarSundayWeekStartKey(noon - 7 * 86_400_000);
}

function nyCalendarSundayWeekStartKey(ms: number): string {
  let { y, mo, d } = nyCalendarPartsFromUtc(ms);
  let noon = utcMsForNyWallClock(y, mo, d, 12, 0);
  for (let i = 0; i < 8; i++) {
    if (nyWeekdaySun0(noon) === 0) {
      const p = nyCalendarPartsFromUtc(noon);
      return `${p.y}-${String(p.mo).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    }
    noon -= 86_400_000;
  }
  return nyDateKeyFromMs(ms);
}

/**
 * Leap week key: Sunday noon ET → next Sunday noon ET. Must match app `nySundayWeekStartKey`.
 */
export function nySundayWeekStartKey(ms: number): string {
  const calendarSunday = nyCalendarSundayWeekStartKey(ms);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(calendarSunday);
  if (!m) return calendarSunday;
  const sundayNoon = utcMsForNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 12, 0);
  if (ms < sundayNoon) {
    const prev = prevNySundayWeekStartKey(calendarSunday);
    return prev ?? calendarSunday;
  }
  return calendarSunday;
}

/** Week key for a leap `challengeDate` label. */
export function nyLeapWeekStartKeyFromChallengeDate(challengeDateKey: string): string {
  const raw = String(challengeDateKey ?? '').trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!m) return nySundayWeekStartKey(Date.now());
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const noon = utcMsForNyWallClock(y, mo, d, 12, 0);
  return nySundayWeekStartKey(noon);
}

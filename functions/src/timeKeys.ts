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

/** `YYYY-MM-DD` of the Sunday (NY) that starts the week containing `ms`. Must match app `nySundayWeekStartKey`. */
export function nySundayWeekStartKey(ms: number): string {
  let { y, mo, d } = nyCalendarPartsFromUtc(ms);
  for (let i = 0; i < 7; i++) {
    const noon = utcMsForNyWallClock(y, mo, d, 12, 0);
    if (nyWeekdaySun0(noon) === 0) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    const prev = nyCalendarPartsFromUtc(noon - 40 * 3600000);
    y = prev.y;
    mo = prev.mo;
    d = prev.d;
  }
  return nyDateKeyFromMs(ms);
}

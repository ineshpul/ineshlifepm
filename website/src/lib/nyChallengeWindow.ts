/** America/New_York calendar parts for a UTC timestamp. */
function nyCalendarPartsFromUtc(ms: number) {
  const s = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
  const [date, time] = s.split(" ");
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return { y, mo, d, h, mi };
}

function utcMsForNyWallClock(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
): number {
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

function nextNyCalendarDay(y: number, mo: number, d: number) {
  const t = utcMsForNyWallClock(y, mo, d, 12, 0) + 25 * 3600000;
  const next = nyCalendarPartsFromUtc(t);
  return { y: next.y, mo: next.mo, d: next.d };
}

export function nyDateKeyFromMs(ms: number): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** True from 12:00 PM ET through midnight ET (matches the mobile app). */
export function isLeapLiveAtMs(nowMs: number): boolean {
  const { y, mo, d } = nyCalendarPartsFromUtc(nowMs);
  const dropAt = utcMsForNyWallClock(y, mo, d, 12, 0);
  const next = nextNyCalendarDay(y, mo, d);
  const expireAt = utcMsForNyWallClock(next.y, next.mo, next.d, 0, 0);
  return nowMs >= dropAt && nowMs < expireAt;
}

export function msUntilNextLeapDrop(nowMs: number): number {
  const { y, mo, d } = nyCalendarPartsFromUtc(nowMs);
  const dropAt = utcMsForNyWallClock(y, mo, d, 12, 0);
  if (nowMs >= dropAt) {
    const next = nextNyCalendarDay(y, mo, d);
    const nextDropAt = utcMsForNyWallClock(next.y, next.mo, next.d, 12, 0);
    return Math.max(0, nextDropAt - nowMs);
  }
  return Math.max(0, dropAt - nowMs);
}

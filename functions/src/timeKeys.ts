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

import {
  calendarWeekDateKeys,
  challengeDateBelongsToWeek,
  getCurrentWeekKeyFromMs,
  getPriorWeekKey,
  leapWeekChallengeDateKeys,
  normalizeWeekKey,
  weekStartKeyFromChallengeDate,
} from './getCurrentWeekKey';

/** @see {@link getCurrentWeekKeyFromMs} — Sunday noon ET week boundary. */
export const nySundayWeekStartKey = getCurrentWeekKeyFromMs;

export const nyLeapWeekStartKeyFromChallengeDate = weekStartKeyFromChallengeDate;

export const nyLeapWeekChallengeDateKeys = leapWeekChallengeDateKeys;

export const nySundayWeekDateKeys = calendarWeekDateKeys;

export const challengeDateBelongsToLeapWeek = challengeDateBelongsToWeek;

export const prevNySundayWeekStartKey = getPriorWeekKey;

const normalizeNyDateKey = normalizeWeekKey;

/** Canonical + compact forms for `challengeDate ==` queries. */
export function challengeDateQueryVariants(dateKey: string): string[] {
  const canon = normalizeNyDateKey(dateKey);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canon);
  if (!m) return [];
  return [canon, `${Number(m[1])}-${Number(m[2])}-${Number(m[3])}`];
}

/** Firestore `in` list with canonical + compact `challengeDate` forms (max 30). */
export function challengeDateKeysForFirestoreIn(dateKeys: readonly string[]): string[] {
  const set = new Set<string>();
  for (const raw of dateKeys) {
    const canon = normalizeNyDateKey(String(raw));
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(canon);
    if (!m) continue;
    set.add(canon);
    set.add(`${Number(m[1])}-${Number(m[2])}-${Number(m[3])}`);
  }
  return Array.from(set).slice(0, 30);
}

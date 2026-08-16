import {
  calendarWeekDateKeys,
  getCurrentWeekKeyFromMs,
  weekStartKeyFromChallengeDate,
} from './getCurrentWeekKey';
import type { BestPartPost } from '../types/bestPart';
import { formatNyDateKeyShort } from '../utils/nyTime';

/** NY calendar weekday: Sunday = 0 … Saturday = 6. Returns -1 if unknown. */
export function nyWeekdaySun0(ms = Date.now()): number {
  const label =
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' })
      .formatToParts(new Date(ms))
      .find((p) => p.type === 'weekday')?.value ?? '';
  const s = label.replace(/\./g, '').toLowerCase();
  if (s.startsWith('sun')) return 0;
  if (s.startsWith('mon')) return 1;
  if (s.startsWith('tue')) return 2;
  if (s.startsWith('wed')) return 3;
  if (s.startsWith('thu')) return 4;
  if (s.startsWith('fri')) return 5;
  if (s.startsWith('sat')) return 6;
  // Fail closed — never treat an unknown weekday as Sunday (week recap gate).
  return -1;
}

/** Week recap entry is Sunday-only (America/New_York). */
export function isNySunday(ms = Date.now()): boolean {
  return nyWeekdaySun0(ms) === 0;
}

/** Current Sun→Sat NY calendar keys for the active leap week window. */
export function currentBestPartWeekDateKeys(ms = Date.now()): string[] {
  return calendarWeekDateKeys(getCurrentWeekKeyFromMs(ms));
}

/** Sun→Sat calendar keys for a requested archive week. */
export function bestPartWeekDateKeys(weekStartKey?: string, ms = Date.now()): string[] {
  const requested = String(weekStartKey ?? '').trim();
  const keys = requested ? calendarWeekDateKeys(requested) : [];
  return keys.length === 7 ? keys : currentBestPartWeekDateKeys(ms);
}

/** Sunday key for the calendar week containing a BPOTD date key. */
export function bestPartWeekStartForDateKey(dateKey: string): string {
  return weekStartKeyFromChallengeDate(dateKey);
}

export function filterPostsInWeek(posts: BestPartPost[], weekKeys: string[]): BestPartPost[] {
  const set = new Set(weekKeys);
  return posts
    .filter((p) => set.has(p.dateKey) && !p.deleted)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export function weekRangeLabel(weekKeys: string[]): string {
  if (weekKeys.length < 2) return '';
  const start = formatNyDateKeyShort(weekKeys[0]!);
  const end = formatNyDateKeyShort(weekKeys[weekKeys.length - 1]!);
  return `${start} – ${end}`.toUpperCase();
}

export function weekdayLabelForDateKey(dateKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return formatNyDateKeyShort(dateKey);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function weekPostsForRecap(posts: BestPartPost[], ms = Date.now()): BestPartPost[] {
  return filterPostsInWeek(posts, currentBestPartWeekDateKeys(ms));
}

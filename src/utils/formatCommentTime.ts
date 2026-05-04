/** Calendar date + time so comments always show when they were posted. */
export function formatCommentTime(atMs: number, nowMs = Date.now()): string {
  if (!Number.isFinite(atMs) || atMs <= 0) return '';
  const diff = Math.max(0, nowMs - atMs);
  const sec = Math.floor(diff / 1000);
  if (sec < 50) return 'Just now';
  const d = new Date(atMs);
  const now = new Date(nowMs);
  const sameYear = d.getFullYear() === now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat(undefined, opts).format(d);
  } catch {
    return d.toLocaleString();
  }
}

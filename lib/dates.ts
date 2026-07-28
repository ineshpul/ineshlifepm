export function todayDateString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function daysBetween(isoA: string, isoB: string): number {
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

export function daysSince(iso: string, now = new Date()): number {
  return daysBetween(iso, now.toISOString());
}

// Monday-anchored week start, for cadence rule resets
export function startOfWeek(d = new Date()): string {
  const date = new Date(d);
  const day = date.getUTCDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return todayDateString(date);
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isThursdayOrLater(d = new Date()): boolean {
  const day = d.getUTCDay();
  return day === 4 || day === 5 || day === 6 || day === 0;
}

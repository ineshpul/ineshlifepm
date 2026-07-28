import type { Settings, Task } from "./types";

// Free calendar minutes for a given date: work window minus recurring block
// overlap minus minutes already scheduled that day. See lib/types.ts Settings
// for why this replaces a live Apple Calendar read.
export function freeCalendarMinutesToday(
  settings: Settings,
  date: Date,
  scheduledTasksToday: Task[]
): number {
  const dow = date.getUTCDay();
  const windowStart = settings.workDayStartMinute;
  const windowEnd = settings.workDayEndMinute;
  let free = Math.max(0, windowEnd - windowStart);

  for (const b of settings.recurringBlocks) {
    if (b.dayOfWeek !== dow) continue;
    const start = Math.max(windowStart, b.startMinute);
    const end = Math.min(windowEnd, b.endMinute);
    if (end > start) free -= end - start;
  }

  for (const t of scheduledTasksToday) {
    free -= t.estimateMinutes ?? 0;
  }

  return Math.max(0, free);
}

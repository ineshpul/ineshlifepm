// §11 Calendar integration — RFC 5545 feed generation.
import type { RecurringBlock, Task } from "./types";

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines SHOULD be folded at 75 octets.
  if (line.length <= 75) return line;
  let out = "";
  let rest = line;
  while (rest.length > 75) {
    out += rest.slice(0, 75) + "\r\n ";
    rest = rest.slice(75);
  }
  return out + rest;
}

interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  recurrenceRule?: string;
}

export function buildIcsFeed(events: IcsEvent[], lastModified: Date): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Personal PM System//EN");
  lines.push("CALSCALE:GREGORIAN");
  lines.push(`X-WR-CALNAME:${icsEscape("Personal PM")}`);

  for (const ev of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(foldLine(`UID:${ev.uid}`));
    lines.push(`DTSTAMP:${formatIcsDate(lastModified)}`);
    lines.push(`DTSTART:${formatIcsDate(ev.start)}`);
    lines.push(`DTEND:${formatIcsDate(ev.end)}`);
    lines.push(foldLine(`SUMMARY:${icsEscape(ev.summary)}`));
    if (ev.description) {
      lines.push(foldLine(`DESCRIPTION:${icsEscape(ev.description)}`));
    }
    if (ev.recurrenceRule) {
      lines.push(`RRULE:${ev.recurrenceRule}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

const DAY_ABBR = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function tasksAndBlocksToIcsEvents(
  tasks: Task[],
  recurringBlocks: RecurringBlock[],
  now: Date
): IcsEvent[] {
  const events: IcsEvent[] = [];
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // strip events older than 30 days

  for (const t of tasks) {
    const at = t.scheduledAt ?? t.dueAt;
    if (!at) continue;
    const start = new Date(at);
    if (start < cutoff) continue;
    const durationMin = t.estimateMinutes ?? 30;
    const end = t.scheduledAt
      ? new Date(start.getTime() + durationMin * 60_000)
      : new Date(start.getTime() + 30 * 60_000);
    events.push({
      uid: `task-${t.id}@personal-pm`,
      summary: t.scheduledAt ? t.title : `Due: ${t.title}`,
      description: t.definitionOfDone ?? undefined,
      start,
      end,
    });
  }

  // Recurring blocks: anchor to the most recent occurrence of dayOfWeek, then repeat weekly.
  for (const b of recurringBlocks) {
    const anchor = new Date(now);
    const diff = (anchor.getUTCDay() - b.dayOfWeek + 7) % 7;
    anchor.setUTCDate(anchor.getUTCDate() - diff);
    anchor.setUTCHours(0, 0, 0, 0);
    const start = new Date(anchor.getTime() + b.startMinute * 60_000);
    const end = new Date(anchor.getTime() + b.endMinute * 60_000);
    events.push({
      uid: `block-${b.id}@personal-pm`,
      summary: b.title,
      start,
      end,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${DAY_ABBR[b.dayOfWeek]}`,
    });
  }

  return events;
}

import type { RecurringBlock } from "./types";

function unfoldIcs(text: string): string {
  return text.replace(/\r\n[ \t]/g, "");
}

function lineValue(chunk: string, key: string): string | null {
  const re = new RegExp(`^${key}[^:]*:(.*)$`, "im");
  const m = chunk.match(re);
  return m ? m[1]!.trim() : null;
}

/** Parse ICS datetime (YYYYMMDDTHHMMSSZ or floating local). */
function parseIcsDateTime(raw: string): Date | null {
  const v = raw.replace(/^.*:/, "").trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z) {
    return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
  }
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
}

const BYDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

function daysFromRrule(rrule: string | null): number[] | null {
  if (!rrule) return null;
  const byday = rrule.match(/BYDAY=([A-Z,]+)/i)?.[1];
  if (!byday) return null;
  return byday.split(",").map((d) => BYDAY_MAP[d.trim().slice(-2)]).filter((n) => n !== undefined);
}

export type ParsedSchoolBlock = Omit<RecurringBlock, "id">;

/**
 * Best-effort ICS import for class schedules (weekly VEVENTs).
 * Non-recurring events become weekly blocks on that weekday.
 */
export function parseIcsToSchoolBlocks(icsText: string): ParsedSchoolBlock[] {
  const text = unfoldIcs(icsText);
  const chunks = text.split("BEGIN:VEVENT").slice(1);
  const out: ParsedSchoolBlock[] = [];

  for (const chunk of chunks) {
    const summary = lineValue(chunk, "SUMMARY")?.replace(/\\n/g, " ").replace(/\\,/g, ",") ?? "Class";
    const dtstart = lineValue(chunk, "DTSTART");
    const dtend = lineValue(chunk, "DTEND");
    const rrule = lineValue(chunk, "RRULE");
    if (!dtstart) continue;

    const start = parseIcsDateTime(dtstart);
    const end = dtend ? parseIcsDateTime(dtend) : null;
    if (!start) continue;

    const startMinute = start.getHours() * 60 + start.getMinutes();
    const endMinute = end
      ? end.getHours() * 60 + end.getMinutes()
      : startMinute + 50;

    const days = daysFromRrule(rrule) ?? [start.getDay()];

    for (const dayOfWeek of days) {
      out.push({
        title: summary,
        dayOfWeek,
        startMinute,
        endMinute: Math.max(endMinute, startMinute + 15),
        areaId: "school",
        source: "school",
      });
    }
  }

  return out;
}

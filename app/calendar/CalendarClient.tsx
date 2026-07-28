"use client";

import { useMemo, useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AREA_COLOR_HEX } from "@/lib/constants";
import type { Area, RecurringBlock, Task } from "@/lib/types";
import { rescheduleTask } from "./actions";

const START_HOUR = 6;
const END_HOUR = 23;
const PX_PER_MIN = 1;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function mondayOf(d: Date) {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setUTCDate(date.getUTCDate() + diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function CalendarClient({
  areas, tasks, recurringBlocks,
}: {
  areas: Area[];
  tasks: Task[];
  recurringBlocks: RecurringBlock[];
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [, startTransition] = useTransition();
  const areaById = new Map(areas.map((a) => [a.id, a]));

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000)),
    [weekStart]
  );

  const scheduled = tasks.filter((t) => t.scheduledAt);
  const unscheduled = tasks.filter(
    (t) => !t.scheduledAt && t.status !== "triage" && t.type !== "delegated" &&
      !["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"].includes(t.status)
  );

  const totalMinutes = (END_HOUR - START_HOUR) * 60;

  function onDrop(e: React.DragEvent<HTMLDivElement>, day: Date) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/task-id");
    if (!taskId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesFromStart = Math.max(0, Math.min(totalMinutes, Math.round(y / PX_PER_MIN / 15) * 15));
    const dt = new Date(day);
    dt.setUTCHours(0, START_HOUR, 0, 0);
    dt.setUTCMinutes(dt.getUTCMinutes() + minutesFromStart);
    startTransition(() => rescheduleTask(taskId, dt.toISOString()));
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Week view. Drag a task from the sidebar onto a slot to schedule it."
        actions={
          <div className="flex gap-2 text-sm">
            <button className="rounded-md border hairline px-2 py-1" onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86_400_000))}>← Prev</button>
            <button className="rounded-md border hairline px-2 py-1" onClick={() => setWeekStart(mondayOf(new Date()))}>Today</button>
            <button className="rounded-md border hairline px-2 py-1" onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86_400_000))}>Next →</button>
          </div>
        }
      />

      <div className="flex gap-4 p-6 md:p-8">
        <aside className="w-56 shrink-0">
          <h2 className="mb-2 text-sm font-medium">Unscheduled</h2>
          <ul className="space-y-1.5">
            {unscheduled.map((t) => {
              const area = areaById.get(t.areaId);
              const hex = area ? AREA_COLOR_HEX[area.colorToken] : "#71717a";
              return (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                  className="cursor-grab rounded-md border px-2 py-1.5 text-xs"
                  style={{ borderColor: hex + "40", background: hex + "12" }}
                >
                  {t.title}
                </li>
              );
            })}
            {unscheduled.length === 0 && <p className="muted text-xs">Nothing unscheduled.</p>}
          </ul>
        </aside>

        <div className="grid flex-1 grid-cols-7 gap-2 overflow-x-auto">
          {days.map((day, i) => {
            const dayKey = day.toISOString().slice(0, 10);
            const dayTasks = scheduled.filter((t) => t.scheduledAt!.slice(0, 10) === dayKey);
            const dow = day.getUTCDay();
            const dayBlocks = recurringBlocks.filter((b) => b.dayOfWeek === dow);

            return (
              <div key={i} className="min-w-[120px]">
                <div className="mb-1 text-center text-xs muted">
                  {DAY_LABELS[dow]} {day.getUTCDate()}
                </div>
                <div
                  className="relative rounded-md border hairline"
                  style={{ height: totalMinutes * PX_PER_MIN }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, day)}
                >
                  {dayBlocks.map((b) => {
                    const top = Math.max(0, b.startMinute - START_HOUR * 60) * PX_PER_MIN;
                    const height = (Math.min(b.endMinute, END_HOUR * 60) - Math.max(b.startMinute, START_HOUR * 60)) * PX_PER_MIN;
                    if (height <= 0) return null;
                    return (
                      <div
                        key={b.id}
                        className="absolute left-0 right-0 bg-black/5 dark:bg-white/5 text-[10px] px-1 muted"
                        style={{ top, height }}
                      >
                        {b.title}
                      </div>
                    );
                  })}
                  {dayTasks.map((t) => {
                    const start = new Date(t.scheduledAt!);
                    const minutesFromStart = start.getUTCHours() * 60 + start.getUTCMinutes() - START_HOUR * 60;
                    const top = Math.max(0, minutesFromStart) * PX_PER_MIN;
                    const height = Math.max(20, (t.estimateMinutes ?? 30) * PX_PER_MIN);
                    const area = areaById.get(t.areaId);
                    const hex = area ? AREA_COLOR_HEX[area.colorToken] : "#71717a";
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                        className="absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded px-1 py-0.5 text-[10px] text-white"
                        style={{ top, height, background: hex }}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

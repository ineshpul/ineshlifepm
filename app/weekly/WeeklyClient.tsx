"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AREA_COLOR_HEX } from "@/lib/constants";
import { guessAreaForTask } from "@/lib/classify-area";
import { areaHex } from "@/lib/area-styles";
import { useAreaFocus } from "@/components/nesh/AreaFocusProvider";
import { btnPrimary, btnSecondary, fieldInput, fieldSelect } from "@/components/nesh/nesh-ui";
import {
  CALENDAR_END_HOUR,
  CALENDAR_START_HOUR,
  DAY_LABELS,
  PX_PER_MIN,
  localDayKey,
  mondayOf,
  weekDays,
} from "@/lib/week-view";
import type { Area, RecurringBlock, Task } from "@/lib/types";
import { clearSchoolSchedule, createWeeklyTask, deleteWeeklyTask, importSchoolScheduleFromIcs, rescheduleTask } from "./actions";

const TERMINAL = ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"];

export function WeeklyClient({
  areas,
  tasks,
  recurringBlocks,
}: {
  areas: Area[];
  tasks: Task[];
  recurringBlocks: RecurringBlock[];
}) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [title, setTitle] = useState("");
  const [areaOverride, setAreaOverride] = useState<string>("");
  const [scheduleDay, setScheduleDay] = useState<string>("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [size, setSize] = useState<"S" | "M" | "L">("M");
  const [note, setNote] = useState<string | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { focusAreaId, isAllAreas } = useAreaFocus();

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const weekEnd = days[6]!;
  const weekLabel = `${days[0]!.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const guess = useMemo(() => guessAreaForTask(title, areas), [title, areas]);
  const effectiveAreaId = areaOverride || guess.areaId;

  const matchesFocus = (areaId: string) => isAllAreas || focusAreaId === areaId;

  const scheduled = tasks.filter((t) => t.scheduledAt && matchesFocus(t.areaId));
  const unscheduled = tasks.filter(
    (t) =>
      matchesFocus(t.areaId) &&
      !t.scheduledAt &&
      t.status !== "triage" &&
      t.type !== "delegated" &&
      !TERMINAL.includes(t.status)
  );
  const inbox = tasks.filter((t) => t.status === "triage" && matchesFocus(t.areaId));

  const schoolBlocks = recurringBlocks.filter((b) => b.source === "school" || b.areaId === "school");
  const otherBlocks = recurringBlocks.filter((b) => !schoolBlocks.includes(b));

  const totalMinutes = (CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60;

  const byAreaThisWeek = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!matchesFocus(t.areaId)) continue;
      if (TERMINAL.includes(t.status)) continue;
      const key = t.areaId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks, isAllAreas, focusAreaId]);

  function onDrop(e: React.DragEvent<HTMLDivElement>, day: Date) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/task-id");
    if (!taskId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const minutesFromStart = Math.max(0, Math.min(totalMinutes, Math.round(y / PX_PER_MIN / 15) * 15));
    const dt = new Date(day);
    dt.setHours(CALENDAR_START_HOUR, 0, 0, 0);
    dt.setMinutes(dt.getMinutes() + minutesFromStart);
    startTransition(async () => {
      await rescheduleTask(taskId, dt.toISOString());
      router.refresh();
    });
  }

  function buildScheduledIso(): string | null {
    if (!scheduleDay) return null;
    const [h, m] = scheduleTime.split(":").map(Number);
    const dt = new Date(scheduleDay + "T00:00:00");
    dt.setHours(h ?? 9, m ?? 0, 0, 0);
    return dt.toISOString();
  }

  function addTask() {
    const t = title.trim();
    if (!t) return;
    setNote(null);
    startTransition(async () => {
      const res = await createWeeklyTask({
        title: t,
        areaId: areaOverride || undefined,
        scheduledAtIso: buildScheduledIso(),
        size,
      });
      setNote(res.message);
      if (res.ok) {
        setTitle("");
        setAreaOverride("");
        router.refresh();
      }
    });
  }

  function onSchoolFile(file: File) {
    setImportNote(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      startTransition(async () => {
        const res = await importSchoolScheduleFromIcs(text);
        setImportNote(res.message);
        if (res.ok) router.refresh();
      });
    };
    reader.readAsText(file);
  }

  return (
    <div className="nesh-page !max-w-[1280px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13.5px] text-[#6b6f7d]">
            Your week at a glance — drop tasks on the grid, or capture below and we&apos;ll{" "}
            <strong className="font-semibold text-[#17181f]">sort by area</strong> when we can.
          </p>
          <p className="mt-1 font-display text-lg font-bold text-[#17181f]">{weekLabel}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * 86_400_000))}>
            ← Prev
          </button>
          <button type="button" className={btnSecondary} onClick={() => setWeekStart(mondayOf(new Date()))}>
            This week
          </button>
          <button type="button" className={btnSecondary} onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * 86_400_000))}>
            Next →
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="card p-4">
          <h2 className="font-display text-[15px] font-bold">Add to your week</h2>
          <input
            className={`${fieldInput} mt-3`}
            placeholder="What are you doing this week?"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setAreaOverride("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
          />
          {title.trim() ? (
            <p className="mt-2 text-[12px] text-[#6b6f7d]">
              Suggested:{" "}
              <span className="font-semibold text-[#17181f]">
                {areaById.get(effectiveAreaId)?.name ?? effectiveAreaId}
              </span>{" "}
              <span className="text-[#9a9aa8]">({areaOverride ? "manual" : guess.reason})</span>
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              className={fieldSelect}
              value={areaOverride || effectiveAreaId}
              onChange={(e) => setAreaOverride(e.target.value)}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select className={fieldSelect} value={size} onChange={(e) => setSize(e.target.value as "S" | "M" | "L")}>
              <option value="S">S</option>
              <option value="M">M</option>
              <option value="L">L</option>
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <select
              className={fieldSelect}
              value={scheduleDay}
              onChange={(e) => setScheduleDay(e.target.value)}
            >
              <option value="">No time yet (inbox)</option>
              {days.map((d) => (
                <option key={localDayKey(d)} value={localDayKey(d)}>
                  {DAY_LABELS[d.getDay()]} {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </option>
              ))}
            </select>
            <input
              type="time"
              className={fieldSelect}
              value={scheduleTime}
              disabled={!scheduleDay}
              onChange={(e) => setScheduleTime(e.target.value)}
            />
          </div>
          {note ? <p className="mt-2 text-[13px] text-[#2fae5b]">{note}</p> : null}
          <button type="button" className={`${btnPrimary} mt-3`} disabled={isPending || !title.trim()} onClick={addTask}>
            Add task
          </button>
        </div>

        <div className="card p-4">
          <h2 className="font-display text-[15px] font-bold">School schedule</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6b6f7d]">
            Upload a <strong className="font-semibold text-[#17181f]">.ics</strong> export from Canvas, Google Calendar, or
            your registrar. Classes show as blue blocks on the week grid and in your calendar feed.
          </p>
          <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#c5d4f8] bg-[#f5f8ff] px-4 py-6 text-center hover:border-[#2563eb]">
            <span className="text-sm font-semibold text-[#2563eb]">Choose schedule file (.ics)</span>
            <span className="mt-1 text-xs text-[#9a9aa8]">Replaces previous school import</span>
            <input
              type="file"
              accept=".ics,text/calendar"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onSchoolFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {schoolBlocks.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-[#6b6f7d]">{schoolBlocks.length} class blocks loaded</span>
              <button
                type="button"
                className="text-xs font-semibold text-[#9a9aa8] hover:text-[#c95a2b] hover:underline"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await clearSchoolSchedule();
                    setImportNote("School schedule cleared.");
                    router.refresh();
                  })
                }
              >
                Clear school import
              </button>
            </div>
          ) : null}
          {importNote ? <p className="mt-2 text-[13px] text-[#2fae5b]">{importNote}</p> : null}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 text-[11px] font-semibold text-[#9a9aa8]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded bg-[#2563eb]/30" /> School / class
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded bg-black/10" /> Other recurring
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded bg-[#6d4aff]" /> Scheduled task
        </span>
      </div>

      <div className="flex gap-4">
        <aside className="hidden w-52 shrink-0 lg:block">
          <h2 className="mb-2 text-sm font-semibold">By area</h2>
          <div className="space-y-3">
            {areas
              .filter((a) => matchesFocus(a.id))
              .map((area) => {
                const list = byAreaThisWeek.get(area.id) ?? [];
                if (list.length === 0) return null;
                const hex = areaHex(area.colorToken);
                return (
                  <div key={area.id}>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-bold" style={{ color: hex }}>
                      <span className="h-2 w-2 rounded-sm" style={{ background: hex }} />
                      {area.name}
                    </div>
                    <ul className="space-y-1 text-[11px] text-[#6b6f7d]">
                      {list.slice(0, 6).map((t) => (
                        <li key={t.id} className="truncate">
                          {t.title}
                        </li>
                      ))}
                      {list.length > 6 ? <li className="text-[#9a9aa8]">+{list.length - 6} more</li> : null}
                    </ul>
                  </div>
                );
              })}
          </div>
          <h2 className="mb-2 mt-5 text-sm font-semibold">Drag onto week</h2>
          <ul className="max-h-[280px] space-y-1.5 overflow-y-auto">
            {[...unscheduled, ...inbox].map((t) => {
              const area = areaById.get(t.areaId);
              const hex = area ? AREA_COLOR_HEX[area.colorToken] : "#71717a";
              return (
                <li
                  key={t.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                  className="group flex cursor-grab items-start justify-between gap-1 rounded-md border px-2 py-1.5 text-xs"
                  style={{ borderColor: hex + "40", background: hex + "12" }}
                >
                  <span>
                    {t.title}
                    <span className="mt-0.5 block text-[10px] text-[#9a9aa8]">{area?.name}</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-[10px] font-semibold text-[#9a9aa8] opacity-0 hover:text-[#c95a2b] group-hover:opacity-100"
                    onClick={() => {
                      if (confirm("Delete this task?")) {
                        startTransition(async () => {
                          await deleteWeeklyTask(t.id);
                          router.refresh();
                        });
                      }
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
            {unscheduled.length === 0 && inbox.length === 0 ? (
              <p className="text-xs text-[#9a9aa8]">Nothing to schedule — add above.</p>
            ) : null}
          </ul>
        </aside>

        <div className="grid min-w-0 flex-1 grid-cols-7 gap-2 overflow-x-auto">
          {days.map((day, i) => {
            const dayKey = localDayKey(day);
            const dayTasks = scheduled.filter((t) => {
              const at = t.scheduledAt!;
              return localDayKey(new Date(at)) === dayKey;
            });
            const dow = day.getDay();
            const blocks = [...schoolBlocks, ...otherBlocks].filter((b) => b.dayOfWeek === dow);

            return (
              <div key={i} className="min-w-[100px]">
                <div className="mb-1 text-center text-xs font-semibold text-[#6b6f7d]">
                  {DAY_LABELS[dow]} {day.getDate()}
                </div>
                <div
                  className="relative rounded-md border border-[#ececf1] bg-white"
                  style={{ height: totalMinutes * PX_PER_MIN }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, day)}
                >
                  {blocks.map((b) => {
                    const top = Math.max(0, b.startMinute - CALENDAR_START_HOUR * 60) * PX_PER_MIN;
                    const height =
                      (Math.min(b.endMinute, CALENDAR_END_HOUR * 60) - Math.max(b.startMinute, CALENDAR_START_HOUR * 60)) *
                      PX_PER_MIN;
                    if (height <= 0) return null;
                    const isSchool = b.source === "school" || b.areaId === "school";
                    return (
                      <div
                        key={b.id}
                        className="absolute left-0 right-0 overflow-hidden px-0.5 text-[9px] font-medium leading-tight"
                        style={{
                          top,
                          height,
                          background: isSchool ? "rgba(37,99,235,0.22)" : "rgba(0,0,0,0.06)",
                          color: isSchool ? "#1d4ed8" : "#6b6f7d",
                        }}
                        title={b.title}
                      >
                        {b.title}
                      </div>
                    );
                  })}
                  {dayTasks.map((t) => {
                    const start = new Date(t.scheduledAt!);
                    const minutesFromStart = start.getHours() * 60 + start.getMinutes() - CALENDAR_START_HOUR * 60;
                    const top = Math.max(0, minutesFromStart) * PX_PER_MIN;
                    const height = Math.max(24, (t.estimateMinutes ?? 30) * PX_PER_MIN);
                    const area = areaById.get(t.areaId);
                    const hex = area ? AREA_COLOR_HEX[area.colorToken] : "#6d4aff";
                    return (
                      <div
                        key={t.id}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                        className="absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded px-1 py-0.5 text-[10px] text-white shadow-sm"
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

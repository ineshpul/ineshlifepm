"use client";

import { useEffect, useState, useTransition } from "react";
import { AREA_COLOR_HEX } from "@/lib/constants";
import type { Area, Assignee, CadenceRule, Settings, TaskSize } from "@/lib/types";
import {
  addRecurringBlock, removeRecurringBlock, rotateCalendarToken, updateGeneralSettings,
  upsertArea, upsertAssignee, upsertCadenceRule,
} from "./actions";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minutesToTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const min = (m % 60).toString().padStart(2, "0");
  return `${h}:${min}`;
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h! * 60 + m!;
}

export function SettingsClient({
  settings, areas, assignees, cadenceRules,
}: {
  settings: Settings;
  areas: Area[];
  assignees: Assignee[];
  cadenceRules: CadenceRule[];
}) {
  const [isPending, startTransition] = useTransition();
  const [focusFactor, setFocusFactor] = useState(settings.focusFactor);
  const [sizeMinutes, setSizeMinutes] = useState(settings.sizeMinutes);
  const [workStart, setWorkStart] = useState(minutesToTime(settings.workDayStartMinute));
  const [workEnd, setWorkEnd] = useState(minutesToTime(settings.workDayEndMinute));
  const [origin, setOrigin] = useState("");
  const [token, setToken] = useState(settings.calendarToken);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  return (
    <div className="nesh-page">
      <div className="space-y-6">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Capacity</h2>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              Focus factor
              <input type="number" step="0.05" min="0" max="1" className="w-20 rounded-md border hairline bg-transparent px-2 py-1" value={focusFactor} onChange={(e) => setFocusFactor(Number(e.target.value))} />
            </label>
            <label className="flex items-center gap-2">
              Work day
              <input type="time" className="rounded-md border hairline bg-transparent px-2 py-1" value={workStart} onChange={(e) => setWorkStart(e.target.value)} />
              to
              <input type="time" className="rounded-md border hairline bg-transparent px-2 py-1" value={workEnd} onChange={(e) => setWorkEnd(e.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex gap-4 text-sm">
            {(["S", "M", "L"] as TaskSize[]).map((s) => (
              <label key={s} className="flex items-center gap-2">
                {s} = <input type="number" className="w-16 rounded-md border hairline bg-transparent px-2 py-1" value={sizeMinutes[s]} onChange={(e) => setSizeMinutes({ ...sizeMinutes, [s]: Number(e.target.value) })} /> min
              </label>
            ))}
          </div>
          <button
            className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
            disabled={isPending}
            onClick={() => startTransition(() => updateGeneralSettings({
              focusFactor, sizeMinutes,
              workDayStartMinute: timeToMinutes(workStart),
              workDayEndMinute: timeToMinutes(workEnd),
            }))}
          >
            Save
          </button>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Calendar feed</h2>
          <p className="mb-2 text-xs muted">Unauthenticated — anyone with this URL can read task titles. Rotate if it leaks.</p>
          <code className="block break-all rounded-md bg-black/5 p-2 text-xs dark:bg-white/5">{origin}/api/calendar/{token}.ics</code>
          <button
            className="mt-2 rounded-md border hairline px-3 py-1.5 text-xs"
            disabled={isPending}
            onClick={() => startTransition(async () => { const t = await rotateCalendarToken(); setToken(t); })}
          >
            Rotate token
          </button>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Recurring calendar blocks</h2>
          <RecurringBlocksEditor blocks={settings.recurringBlocks} pending={isPending} startTransition={startTransition} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Areas</h2>
          <AreasEditor areas={areas} pending={isPending} startTransition={startTransition} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Assignees</h2>
          <AssigneesEditor assignees={assignees} pending={isPending} startTransition={startTransition} />
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Cadence rules</h2>
          <CadenceEditor areas={areas} rules={cadenceRules} pending={isPending} startTransition={startTransition} />
        </section>
      </div>
    </div>
  );
}

function RecurringBlocksEditor({ blocks, pending, startTransition }: { blocks: Settings["recurringBlocks"]; pending: boolean; startTransition: (fn: () => void) => void }) {
  const [title, setTitle] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");

  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {blocks.map((b) => (
          <li key={b.id} className="flex items-center justify-between">
            <span>{DAY_NAMES[b.dayOfWeek]} {minutesToTime(b.startMinute)}–{minutesToTime(b.endMinute)} — {b.title}</span>
            <button className="text-xs muted hover:underline" onClick={() => startTransition(() => removeRecurringBlock(b.id))}>Remove</button>
          </li>
        ))}
        {blocks.length === 0 && <p className="muted text-sm">No recurring blocks.</p>}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input className="rounded-md border hairline bg-transparent px-2 py-1" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="rounded-md border hairline bg-transparent px-2 py-1" value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))}>
          {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <input type="time" className="rounded-md border hairline bg-transparent px-2 py-1" value={start} onChange={(e) => setStart(e.target.value)} />
        <input type="time" className="rounded-md border hairline bg-transparent px-2 py-1" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button
          className="rounded-md border hairline px-2 py-1 text-xs"
          disabled={pending || !title.trim()}
          onClick={() => { startTransition(() => addRecurringBlock({ title: title.trim(), dayOfWeek, startMinute: timeToMinutes(start), endMinute: timeToMinutes(end) })); setTitle(""); }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function AreasEditor({ areas, pending, startTransition }: { areas: Area[]; pending: boolean; startTransition: (fn: () => void) => void }) {
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState("violet");

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {areas.map((a) => (
          <li key={a.id} className="rounded-full border px-2 py-1 text-xs" style={{ borderColor: (AREA_COLOR_HEX[a.colorToken] ?? "#71717a") + "40" }}>
            {a.name}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 text-sm">
        <input className="rounded-md border hairline bg-transparent px-2 py-1" placeholder="New area name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded-md border hairline bg-transparent px-2 py-1" value={colorToken} onChange={(e) => setColorToken(e.target.value)}>
          {Object.keys(AREA_COLOR_HEX).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          className="rounded-md border hairline px-2 py-1 text-xs"
          disabled={pending || !name.trim()}
          onClick={() => { startTransition(() => upsertArea({ name: name.trim(), colorToken, sortOrder: areas.length, isCadenceOnly: false })); setName(""); }}
        >
          Add area
        </button>
      </div>
    </div>
  );
}

function AssigneesEditor({ assignees, pending, startTransition }: { assignees: Assignee[]; pending: boolean; startTransition: (fn: () => void) => void }) {
  const [name, setName] = useState("");
  const [reliability, setReliability] = useState<"reliable" | "variable">("reliable");

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {assignees.map((a) => <li key={a.id} className="rounded-full border hairline px-2 py-1 text-xs">{a.name} ({a.reliability})</li>)}
      </ul>
      <div className="flex items-center gap-2 text-sm">
        <input className="rounded-md border hairline bg-transparent px-2 py-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded-md border hairline bg-transparent px-2 py-1" value={reliability} onChange={(e) => setReliability(e.target.value as "reliable" | "variable")}>
          <option value="reliable">Reliable</option>
          <option value="variable">Variable</option>
        </select>
        <button
          className="rounded-md border hairline px-2 py-1 text-xs"
          disabled={pending || !name.trim()}
          onClick={() => { startTransition(() => upsertAssignee({ name: name.trim(), reliability })); setName(""); }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function CadenceEditor({ areas, rules, pending, startTransition }: { areas: Area[]; rules: CadenceRule[]; pending: boolean; startTransition: (fn: () => void) => void }) {
  const [areaId, setAreaId] = useState(areas[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState(3);
  const [min, setMin] = useState("");

  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {rules.map((r) => <li key={r.id}>{r.title} — {r.targetPerWeek}/week{r.minPerWeek ? ` (range ${r.minPerWeek}-${r.targetPerWeek})` : ""}</li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select className="rounded-md border hairline bg-transparent px-2 py-1" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <input className="rounded-md border hairline bg-transparent px-2 py-1" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="number" className="w-16 rounded-md border hairline bg-transparent px-2 py-1" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        <input type="number" className="w-16 rounded-md border hairline bg-transparent px-2 py-1" placeholder="min (opt)" value={min} onChange={(e) => setMin(e.target.value)} />
        <button
          className="rounded-md border hairline px-2 py-1 text-xs"
          disabled={pending || !title.trim()}
          onClick={() => { startTransition(() => upsertCadenceRule({ areaId, title: title.trim(), targetPerWeek: target, minPerWeek: min ? Number(min) : null })); setTitle(""); }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

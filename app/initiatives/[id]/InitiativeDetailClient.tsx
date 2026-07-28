"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AreaTag } from "@/components/AreaTag";
import { formatDate } from "@/lib/dates";
import { Sparkline } from "@/app/metrics/Sparkline";
import type { Area, Assignee, Goal, Initiative, InitiativeStatus, Metric, MetricReading, Task } from "@/lib/types";
import { addOutcomeNote, linkGoalToInitiative, linkMetricToInitiative, updateInitiativeStatus, updatePlanBody } from "../actions";

const STATUSES: InitiativeStatus[] = ["planning", "running", "handing_off", "complete", "parked"];

export function InitiativeDetailClient({
  initiative, areas, assignees, goals, allGoals, metrics, allMetrics, readingsByMetric, tasks,
}: {
  initiative: Initiative;
  areas: Area[];
  assignees: Assignee[];
  goals: Goal[];
  allGoals: Goal[];
  metrics: Metric[];
  allMetrics: Metric[];
  readingsByMetric: Record<string, MetricReading[]>;
  tasks: Task[];
}) {
  const [isPending, startTransition] = useTransition();
  const [planBody, setPlanBody] = useState(initiative.planBody);
  const [planDirty, setPlanDirty] = useState(false);
  const [note, setNote] = useState("");
  const area = areas.find((a) => a.id === initiative.areaId);
  const owner = initiative.ownerId ? assignees.find((a) => a.id === initiative.ownerId) : null;

  const closedTasks = tasks
    .filter((t) => t.closedAt)
    .sort((a, b) => (a.closedAt! < b.closedAt! ? 1 : -1));

  const unlinkedGoals = allGoals.filter((g) => g.areaId === initiative.areaId && !goals.some((lg) => lg.id === g.id));
  const unlinkedMetrics = allMetrics.filter((m) => m.areaId === initiative.areaId && !metrics.some((lm) => lm.id === m.id));

  return (
    <div>
      <PageHeader
        title={initiative.title}
        subtitle={area?.name}
        actions={
          <div className="flex items-center gap-2 text-sm">
            <select
              className="rounded-md border hairline bg-transparent px-2 py-1.5"
              value={initiative.status}
              onChange={(e) => startTransition(() => updateInitiativeStatus(initiative.id, e.target.value as InitiativeStatus))}
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
        }
      />

      <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div className="card p-4 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 muted text-xs">
              {area && <span>Area: <span className="text-[var(--text)]"><AreaTag name={area.name} colorToken={area.colorToken} /></span></span>}
              <span>Owner: {owner?.name ?? "—"}</span>
              <span>Started: {formatDate(initiative.startedAt)}</span>
              <span>Target: {formatDate(initiative.targetDate)}</span>
              {initiative.status === "parked" && <span>Restarts: {formatDate(initiative.restartAt)}</span>}
            </div>
          </div>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">The plan</h2>
              {planDirty && (
                <button
                  className="rounded-md bg-[var(--accent)] px-2 py-1 text-xs text-[var(--bg)]"
                  disabled={isPending}
                  onClick={() => startTransition(async () => { await updatePlanBody(initiative.id, planBody); setPlanDirty(false); })}
                >
                  Save
                </button>
              )}
            </div>
            <textarea
              className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
              rows={8}
              value={planBody}
              onChange={(e) => { setPlanBody(e.target.value); setPlanDirty(true); }}
            />
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">Linked goals</h2>
              {unlinkedGoals.length > 0 && (
                <select
                  className="rounded-md border hairline bg-transparent px-2 py-1 text-xs"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) startTransition(() => linkGoalToInitiative(initiative.id, e.target.value)); }}
                >
                  <option value="">Link a goal…</option>
                  {unlinkedGoals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
                </select>
              )}
            </div>
            {goals.length === 0 ? <p className="muted text-sm">No linked goals.</p> : (
              <ul className="space-y-2">
                {goals.map((g) => (
                  <li key={g.id} className="text-sm">
                    {g.title} <span className="muted text-xs">— {g.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">Linked metrics</h2>
              {unlinkedMetrics.length > 0 && (
                <select
                  className="rounded-md border hairline bg-transparent px-2 py-1 text-xs"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) startTransition(() => linkMetricToInitiative(initiative.id, e.target.value)); }}
                >
                  <option value="">Link a metric…</option>
                  {unlinkedMetrics.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )}
            </div>
            {metrics.length === 0 ? <p className="muted text-sm">No linked metrics.</p> : (
              <div className="space-y-3">
                {metrics.map((m) => (
                  <div key={m.id} className="flex items-center justify-between">
                    <span className="text-sm">{m.name}</span>
                    <Sparkline readings={readingsByMetric[m.id] ?? []} target={m.targetValue} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {initiative.status === "handing_off" && (
            <section className="card p-4">
              <h2 className="mb-2 text-sm font-medium">Handoff</h2>
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="muted text-xs">Owner:</span>
                <select
                  className="rounded-md border hairline bg-transparent px-2 py-1 text-xs"
                  value={initiative.ownerId ?? ""}
                  onChange={(e) => startTransition(() => updateInitiativeStatus(initiative.id, "handing_off", { ownerId: e.target.value || null }))}
                >
                  <option value="">Unassigned</option>
                  {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <p className="muted text-xs">Log what has transferred and what remains via outcome notes below.</p>
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-2 text-sm font-medium">How it&apos;s going</h2>
            <div className="mb-3 flex gap-2">
              <input
                className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
                placeholder="Add a dated note…"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && note.trim()) {
                    startTransition(() => addOutcomeNote(initiative.id, note.trim()));
                    setNote("");
                  }
                }}
              />
              <button
                className="rounded-md border hairline px-3 py-1.5 text-xs"
                onClick={() => { if (note.trim()) { startTransition(() => addOutcomeNote(initiative.id, note.trim())); setNote(""); } }}
              >
                Add
              </button>
            </div>
            <ul className="space-y-2">
              {[...initiative.outcomeNotes].reverse().map((n, i) => (
                <li key={i} className="text-sm">
                  <span className="muted text-xs">{formatDate(n.date)}</span> — {n.body}
                </li>
              ))}
              {initiative.outcomeNotes.length === 0 && <p className="muted text-sm">Nothing recorded yet.</p>}
            </ul>
          </section>
        </div>

        <aside>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-medium">Activity</h2>
            {closedTasks.length === 0 ? <p className="muted text-xs">Nothing closed yet.</p> : (
              <ul className="space-y-1.5 text-xs">
                {closedTasks.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="muted shrink-0">{formatDate(t.closedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

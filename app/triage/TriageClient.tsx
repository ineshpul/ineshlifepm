"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AreaTag } from "@/components/AreaTag";
import { SEVERITY_LABELS } from "@/lib/constants";
import type { Area, Assignee, Goal, Task } from "@/lib/types";
import { assignGoalAndAdvance, sendToBacklog, delegateFromTriage, deleteFromTriage } from "./actions";

export function TriageClient({
  areas, tasks, goals, assignees,
}: {
  areas: Area[];
  tasks: Task[];
  goals: Goal[];
  assignees: Assignee[];
}) {
  const areaById = new Map(areas.map((a) => [a.id, a]));

  return (
    <div>
      <PageHeader title="Triage" subtitle={`${tasks.length} item${tasks.length === 1 ? "" : "s"} · cleared weekly`} />
      <div className="space-y-3 p-6 md:p-8">
        {tasks.length === 0 && <p className="muted text-sm">Triage is clear.</p>}
        {tasks.map((t) => (
          <TriageItem key={t.id} task={t} area={areaById.get(t.areaId)} goals={goals.filter((g) => g.areaId === t.areaId)} assignees={assignees} />
        ))}
      </div>
    </div>
  );
}

function TriageItem({
  task, area, goals, assignees,
}: {
  task: Task;
  area: Area | undefined;
  goals: Goal[];
  assignees: Assignee[];
}) {
  const [mode, setMode] = useState<"none" | "goal" | "delegate">("none");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [goalId, setGoalId] = useState("");
  const [definitionOfDone, setDefinitionOfDone] = useState(task.definitionOfDone ?? "");
  const [severity, setSeverity] = useState<number | "">(task.severity ?? "");
  const [hypothesis, setHypothesis] = useState(task.hypothesis ?? "");
  const [targetMetric, setTargetMetric] = useState(task.targetMetric ?? "");
  const [assigneeId, setAssigneeId] = useState(assignees[0]?.id ?? "");

  const needsRepro = task.type === "build" && (task.subtype === "bug" || task.subtype === "issue");
  const needsHypothesis = task.type === "build" && task.subtype === "feature";

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{task.title}</span>
            {task.subtype && <span className="rounded-full border hairline px-2 py-0.5 text-[10px] muted">{task.subtype}</span>}
          </div>
          {area && <div className="mt-1"><AreaTag name={area.name} colorToken={area.colorToken} /></div>}
        </div>
        <div className="flex gap-2 text-xs">
          <button className="muted hover:underline" onClick={() => setMode(mode === "goal" ? "none" : "goal")}>Assign / backlog</button>
          <button className="muted hover:underline" onClick={() => setMode(mode === "delegate" ? "none" : "delegate")}>Delegate</button>
          <button
            className="text-red-600 hover:underline dark:text-red-400"
            onClick={() => { if (confirm("Delete this item?")) startTransition(() => deleteFromTriage(task.id)); }}
          >
            Delete
          </button>
        </div>
      </div>

      {mode === "goal" && (
        <div className="mt-3 space-y-2 border-t hairline pt-3">
          {needsRepro && (
            <>
              <textarea
                className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
                placeholder={task.subtype === "bug" ? "Repro steps" : "Observation"}
                value={definitionOfDone}
                onChange={(e) => setDefinitionOfDone(e.target.value)}
                rows={2}
              />
              <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
                <option value="">Severity…</option>
                {Object.entries(SEVERITY_LABELS).map(([v, label]) => <option key={v} value={v}>{v} — {label}</option>)}
              </select>
            </>
          )}
          {needsHypothesis && (
            <>
              <textarea
                className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
                placeholder="We believe [change] will cause [metric] to move [direction] because [reason]. We will know we are right if [threshold] within [timeframe]."
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                rows={3}
              />
              <input
                className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
                placeholder="Target metric"
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
              />
            </>
          )}
          {!needsRepro && !needsHypothesis && (
            <textarea
              className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
              placeholder="Definition of done"
              value={definitionOfDone}
              onChange={(e) => setDefinitionOfDone(e.target.value)}
              rows={2}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">No goal — send to backlog</option>
              {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <button
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const payload = { definitionOfDone, severity: severity === "" ? null : Number(severity), hypothesis, targetMetric };
                    if (goalId) await assignGoalAndAdvance(task.id, { goalId, ...payload });
                    else await sendToBacklog(task.id, payload);
                    setMode("none");
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not save.");
                  }
                });
              }}
            >
              {goalId ? "Assign to goal" : "Send to backlog"}
            </button>
          </div>
        </div>
      )}

      {mode === "delegate" && (
        <div className="mt-3 space-y-2 border-t hairline pt-3">
          <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            {assignees.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.reliability})</option>)}
          </select>
          <textarea
            className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
            placeholder="Acceptance criteria"
            value={definitionOfDone}
            onChange={(e) => setDefinitionOfDone(e.target.value)}
            rows={2}
          />
          <button
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
            disabled={isPending || !assigneeId}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await delegateFromTriage(task.id, assigneeId, definitionOfDone);
                  setMode("none");
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not delegate.");
                }
              });
            }}
          >
            Delegate
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

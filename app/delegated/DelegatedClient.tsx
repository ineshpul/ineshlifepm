"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AreaTag } from "@/components/AreaTag";
import { daysSince, formatDate } from "@/lib/dates";
import type { Area, Assignee, Goal, Task } from "@/lib/types";
import { advanceDelegatedStatus } from "./actions";

const PIPELINE = ["specced", "sent", "in_progress", "review", "accepted"];

export function DelegatedClient({
  areas, assignees, tasks, goals,
}: {
  areas: Area[];
  assignees: Assignee[];
  tasks: Task[];
  goals: Goal[];
}) {
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const [scopeFor, setScopeFor] = useState<string | null>(null);

  const byAssignee = new Map<string, Task[]>();
  const unassigned: Task[] = [];
  for (const t of tasks) {
    if (!t.assigneeId) { unassigned.push(t); continue; }
    if (!byAssignee.has(t.assigneeId)) byAssignee.set(t.assigneeId, []);
    byAssignee.get(t.assigneeId)!.push(t);
  }

  return (
    <div>
      <PageHeader title="Delegated" subtitle="Excluded from capacity and the daily score." />
      <div className="space-y-8 p-6 md:p-8">
        {assignees.map((a) => {
          const items = byAssignee.get(a.id) ?? [];
          if (items.length === 0) return null;
          return (
            <section key={a.id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                {a.name}
                <span className="rounded-full border hairline px-2 py-0.5 text-[10px] font-normal muted">{a.reliability}</span>
              </h2>
              <div className="card divide-y hairline">
                {items.map((t) => {
                  const goal = t.goalId ? goalById.get(t.goalId) : null;
                  const warn =
                    a.reliability === "variable" && goal?.targetDate &&
                    (new Date(goal.targetDate).getTime() - Date.now()) / 86_400_000 <= 14 &&
                    goal.status === "active";
                  return (
                    <div key={t.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium">{t.title}</div>
                          {areaById.get(t.areaId) && <div className="mt-1"><AreaTag name={areaById.get(t.areaId)!.name} colorToken={areaById.get(t.areaId)!.colorToken} /></div>}
                          <div className="mt-1 text-xs muted">
                            {daysSince(t.lastTouchedAt)} days since last movement
                          </div>
                          {t.definitionOfDone && <div className="mt-1 text-xs muted">Acceptance: {t.definitionOfDone}</div>}
                          {warn && (
                            <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                              {a.name} is variable-reliability and this blocks a goal due within 14 days.
                            </div>
                          )}
                        </div>
                        <select
                          className="rounded-md border hairline bg-transparent px-2 py-1 text-xs"
                          value={t.status}
                          onChange={(e) => advanceDelegatedStatus(t.id, e.target.value)}
                        >
                          {PIPELINE.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                        </select>
                      </div>
                      <button className="mt-2 text-xs muted hover:underline" onClick={() => setScopeFor(scopeFor === t.id ? null : t.id)}>
                        {scopeFor === t.id ? "Hide scope of work" : "Generate scope of work"}
                      </button>
                      {scopeFor === t.id && <ScopeOfWork task={t} />}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        {unassigned.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold muted">Unassigned</h2>
            <div className="card divide-y hairline">
              {unassigned.map((t) => <div key={t.id} className="p-4 text-sm">{t.title}</div>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function ScopeOfWork({ task }: { task: Task }) {
  const [context, setContext] = useState("");
  const [outOfScope, setOutOfScope] = useState("");
  const [copied, setCopied] = useState(false);

  const text = `Context: ${context || "—"}
Deliverable: ${task.title}
Acceptance criteria: ${task.definitionOfDone || "—"}
Out of scope: ${outOfScope || "—"}
Due: ${formatDate(task.dueAt)}`;

  return (
    <div className="mt-3 space-y-2 rounded-md border hairline p-3">
      <textarea className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-xs" placeholder="Context (2 sentences)" rows={2} value={context} onChange={(e) => setContext(e.target.value)} />
      <textarea className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-xs" placeholder="Out of scope" rows={2} value={outOfScope} onChange={(e) => setOutOfScope(e.target.value)} />
      <pre className="whitespace-pre-wrap rounded-md bg-black/5 p-3 text-xs dark:bg-white/5">{text}</pre>
      <button
        className="rounded-md border hairline px-2 py-1 text-xs"
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

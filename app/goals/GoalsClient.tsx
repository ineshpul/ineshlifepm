"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AreaTag } from "@/components/AreaTag";
import { formatDate } from "@/lib/dates";
import type { Area, Goal, Initiative, Task, VisionItem } from "@/lib/types";
import { upsertGoal } from "./actions";

function progressFor(goalId: string, tasks: Task[]) {
  const steps = tasks.filter((t) => t.goalId === goalId);
  const closed = steps.filter((t) =>
    ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"].includes(t.status)
  ).length;
  return { steps, closed, total: steps.length };
}

export function GoalsClient({
  areas, goals, tasks, visionItems, initiatives,
}: {
  areas: Area[];
  goals: Goal[];
  tasks: Task[];
  visionItems: VisionItem[];
  initiatives: Initiative[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creatingArea, setCreatingArea] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const visionById = new Map(visionItems.map((v) => [v.id, v]));

  const goalsByArea = new Map<string, Goal[]>();
  for (const g of goals) {
    if (!goalsByArea.has(g.areaId)) goalsByArea.set(g.areaId, []);
    goalsByArea.get(g.areaId)!.push(g);
  }

  return (
    <div>
      <PageHeader title="Goals" subtitle="Active work in play this quarter, with defined steps." />
      <div className="space-y-8 p-6 md:p-8">
        {areas.map((area) => {
          const areaGoals = (goalsByArea.get(area.id) ?? []).sort((a, b) => b.priority - a.priority);
          return (
            <section key={area.id}>
              <div className="mb-3 flex items-center justify-between">
                <AreaTag name={area.name} colorToken={area.colorToken} />
                <button
                  className="text-xs muted hover:underline"
                  onClick={() => setCreatingArea(creatingArea === area.id ? null : area.id)}
                >
                  + New goal
                </button>
              </div>

              {creatingArea === area.id && (
                <NewGoalForm
                  areaId={area.id}
                  initiatives={initiatives.filter((i) => i.areaId === area.id)}
                  onDone={() => setCreatingArea(null)}
                  onError={setError}
                  pending={isPending}
                  startTransition={startTransition}
                />
              )}

              {areaGoals.length === 0 ? (
                <p className="muted text-sm">No goals yet.</p>
              ) : (
                <div className="card divide-y hairline">
                  {areaGoals.map((g) => {
                    const { steps, closed, total } = progressFor(g.id, tasks);
                    const pct = total ? Math.round((closed / total) * 100) : 0;
                    const isOpen = expanded === g.id;
                    return (
                      <div key={g.id} className="p-4">
                        <button
                          className="flex w-full items-center gap-4 text-left"
                          onClick={() => setExpanded(isOpen ? null : g.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{g.title}</span>
                              {g.status === "parked" && (
                                <span className="rounded-full border hairline px-2 py-0.5 text-[10px] muted">parked</span>
                              )}
                              {g.status === "not_started" && (
                                <span className="rounded-full border hairline px-2 py-0.5 text-[10px] muted">not started</span>
                              )}
                            </div>
                            <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: "var(--accent)" }}
                              />
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs muted">
                            <div>P{g.priority}</div>
                            <div>{formatDate(g.targetDate)}</div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="mt-4 space-y-3 border-t hairline pt-4 text-sm">
                            <div>
                              <div className="text-xs muted">Success definition</div>
                              <div>{g.successDefinition || "—"}</div>
                            </div>
                            {g.visionItemId && visionById.get(g.visionItemId) && (
                              <div>
                                <div className="text-xs muted">Linked vision</div>
                                <div>{visionById.get(g.visionItemId)!.title}</div>
                              </div>
                            )}
                            <div>
                              <div className="mb-1 text-xs muted">Steps ({closed}/{total})</div>
                              {steps.length === 0 ? (
                                <p className="muted text-xs">No steps yet.</p>
                              ) : (
                                <ul className="space-y-1">
                                  {steps.map((s) => (
                                    <li key={s.id} className="flex items-center gap-2">
                                      <span
                                        className={
                                          ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"].includes(s.status)
                                            ? "line-through muted"
                                            : ""
                                        }
                                      >
                                        {s.title}
                                      </span>
                                      {s.type === "delegated" && (
                                        <span className="rounded-full border hairline px-1.5 py-0 text-[10px] muted">delegated</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

function NewGoalForm({
  areaId, initiatives, onDone, onError, pending, startTransition,
}: {
  areaId: string;
  initiatives: Initiative[];
  onDone: () => void;
  onError: (e: string | null) => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [title, setTitle] = useState("");
  const [successDefinition, setSuccessDefinition] = useState("");
  const [priority, setPriority] = useState(3);
  const [targetDate, setTargetDate] = useState("");
  const [initiativeId, setInitiativeId] = useState("");

  return (
    <div className="card mb-3 space-y-2 p-4">
      <input
        className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
        placeholder="Goal title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <textarea
        className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
        placeholder="Success definition — numeric or testable. Required to activate."
        value={successDefinition}
        onChange={(e) => setSuccessDefinition(e.target.value)}
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <select
          className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
        >
          {[1, 2, 3, 4, 5].map((p) => <option key={p} value={p}>Priority {p}</option>)}
        </select>
        <input
          type="date"
          className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        {initiatives.length > 0 && (
          <select
            className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
            value={initiativeId}
            onChange={(e) => setInitiativeId(e.target.value)}
          >
            <option value="">No initiative</option>
            {initiatives.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
          disabled={pending || !title.trim()}
          onClick={() => {
            onError(null);
            startTransition(async () => {
              try {
                await upsertGoal({
                  areaId,
                  initiativeId: initiativeId || null,
                  title: title.trim(),
                  successDefinition,
                  targetDate: targetDate || null,
                  priority,
                  status: "not_started",
                  visionItemId: null,
                });
                onDone();
              } catch (e) {
                onError(e instanceof Error ? e.message : "Could not save goal.");
              }
            });
          }}
        >
          Save goal
        </button>
        <button className="text-xs muted" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

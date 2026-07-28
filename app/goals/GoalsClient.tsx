"use client";

import { useState, useTransition } from "react";
import { AreaTag } from "@/components/AreaTag";
import { areaHex } from "@/lib/area-styles";
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
    <div className="nesh-page">
      <p className="mb-6 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6f7d]">
        Goals in play this quarter. Every one has a clear{" "}
        <strong className="font-semibold text-[#17181f]">definition of done</strong> — a number or a plain yes/no — or
        it can&apos;t go active.
      </p>
      <div className="space-y-8">
        {areas.map((area) => {
          const areaGoals = (goalsByArea.get(area.id) ?? []).sort((a, b) => b.priority - a.priority);
          if (areaGoals.length === 0) return null;
          const hex = areaHex(area.colorToken);
          return (
            <section key={area.id}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: hex }} />
                <span className="font-display text-[15px] font-bold">{area.name}</span>
                <span className="text-xs font-medium text-[#a7a7b3]">{areaGoals.length} goals</span>
                <button
                  className="ml-auto text-xs font-semibold text-[#6d4aff] hover:underline"
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

              {areaGoals.length === 0 ? null : (
                <div className="card overflow-hidden">
                  {areaGoals.map((g, idx) => {
                    const { steps, closed, total } = progressFor(g.id, tasks);
                    const pct = total ? Math.round((closed / total) * 100) : 0;
                    const isOpen = expanded === g.id;
                    return (
                      <div key={g.id} className={`px-5 py-4 ${idx > 0 ? "border-t border-[#f4f4f8]" : ""}`}>
                        <button
                          className="flex w-full items-center gap-4 text-left"
                          onClick={() => setExpanded(isOpen ? null : g.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-[#f4f4f8] px-1.5 py-0.5 text-[11px] font-bold text-[#9a9aa8]">P{g.priority}</span>
                              <span className="text-[14.5px] font-semibold text-[#1c1c24]">{g.title}</span>
                            </div>
                            <p className="mt-1 line-clamp-1 text-[12.5px] text-[#8d8d99]">{g.successDefinition}</p>
                          </div>
                          <div className="w-[190px] shrink-0">
                            <div className="mb-1 flex justify-between text-[11.5px] text-[#9a9aa8]">
                              <span className="font-semibold" style={{ color: hex }}>{pct}%</span>
                              <span>{closed}/{total} steps</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded bg-[#f2f2f6]">
                              <div className="h-full rounded" style={{ width: `${pct}%`, background: hex }} />
                            </div>
                          </div>
                          <div className="w-[104px] shrink-0 text-right">
                            <div className="text-[12.5px] font-semibold text-[#3d3d47]">{formatDate(g.targetDate)}</div>
                            <div className="text-[11px] text-[#b7b7c4]">target date</div>
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

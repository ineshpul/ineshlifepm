"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AreaTag } from "@/components/AreaTag";
import { useAreaFocus } from "@/components/nesh/AreaFocusProvider";
import { areaHex } from "@/lib/area-styles";
import { SEVERITY_LABELS } from "@/lib/constants";
import type { Area, Assignee, Goal, Task } from "@/lib/types";
import { assignGoalAndAdvance, sendToBacklog, delegateFromTriage, deleteFromTriage } from "./actions";
import { quickAddToTriage } from "@/app/today/actions";

const TERMINAL = ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"];

function listKey(task: Task, goals: Goal[]): string {
  if (task.status === "triage") return "Inbox";
  if (task.goalId) {
    const g = goals.find((x) => x.id === task.goalId);
    if (g) return g.title;
  }
  return "Active";
}

export function TriageClient({
  areas,
  tasks,
  goals,
  assignees,
}: {
  areas: Area[];
  tasks: Task[];
  goals: Goal[];
  assignees: Assignee[];
}) {
  const { focusAreaId, isAllAreas } = useAreaFocus();
  const [newTitle, setNewTitle] = useState("");
  const [newArea, setNewArea] = useState(areas[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const open = tasks.filter((t) => !TERMINAL.includes(t.status));
  const filtered = open.filter((t) => isAllAreas || t.areaId === focusAreaId);

  const sectors = useMemo(() => {
    const byArea = new Map<string, Task[]>();
    for (const t of filtered) {
      if (!byArea.has(t.areaId)) byArea.set(t.areaId, []);
      byArea.get(t.areaId)!.push(t);
    }
    return [...byArea.entries()].map(([areaId, areaTasks]) => {
      const lists = new Map<string, Task[]>();
      for (const t of areaTasks) {
        const name = listKey(t, goals);
        if (!lists.has(name)) lists.set(name, []);
        lists.get(name)!.push(t);
      }
      return {
        areaId,
        area: areaById.get(areaId),
        lists: [...lists.entries()].map(([name, items]) => ({ name, items })),
        total: areaTasks.length,
      };
    });
  }, [filtered, goals, areaById]);

  return (
    <div className="nesh-page">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-[#6b6f7d]">
          One home for everything on your plate. Tasks live in <strong className="font-semibold text-[#17181f]">lists</strong>{" "}
          inside each area — inbox first, then active work.
        </p>
        <div className="flex gap-2">
          <select
            className="rounded-[10px] border border-[#e6e6ee] bg-white px-2 py-2 text-sm"
            value={newArea}
            onChange={(e) => setNewArea(e.target.value)}
          >
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            className="w-48 rounded-[10px] border border-[#e6e6ee] px-3 py-2 text-sm"
            placeholder="New task title…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                startTransition(async () => {
                  await quickAddToTriage(newTitle.trim(), newArea);
                  setNewTitle("");
                  router.refresh();
                });
              }
            }}
          />
          <button
            type="button"
            className="rounded-[10px] bg-[#17181f] px-4 py-2 text-[13px] font-semibold text-white"
            disabled={!newTitle.trim() || isPending}
            onClick={() =>
              startTransition(async () => {
                await quickAddToTriage(newTitle.trim(), newArea);
                setNewTitle("");
                router.refresh();
              })
            }
          >
            ＋ New task
          </button>
        </div>
      </div>

      {sectors.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#dcdce4] bg-white px-6 py-12 text-center text-sm text-[#a7a7b3]">
          No open tasks in this focus. Add one above or change <strong>FOCUS ON</strong>.
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {sectors.map((sector) => {
            const hex = sector.area ? areaHex(sector.area.colorToken) : "#6d4aff";
            return (
              <section key={sector.areaId}>
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: hex }} />
                  <span className="font-display text-base font-bold">{sector.area?.name}</span>
                  <span className="text-xs font-medium text-[#a7a7b3]">{sector.total} open</span>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sector.lists.map((list) => (
                    <div key={list.name} className="card overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-[#f4f4f8] px-4 py-3">
                        <span className="text-[13.5px] font-bold text-[#1c1c24]">{list.name}</span>
                        <span className="text-[11px] font-semibold text-[#a7a7b3]">{list.items.length}</span>
                      </div>
                      <div className="divide-y divide-[#f4f4f8]">
                        {list.items.map((t) => (
                          <TriageItem
                            key={t.id}
                            task={t}
                            area={sector.area}
                            goals={goals.filter((g) => g.areaId === t.areaId)}
                            assignees={assignees}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-[#a7a7b3]">
        Classic triage actions still apply on <strong>Inbox</strong> items.{" "}
        <Link href="/today" className="font-semibold text-[#6d4aff]">
          Back to Today →
        </Link>
      </p>
    </div>
  );
}

function TriageItem({
  task,
  area,
  goals,
  assignees,
}: {
  task: Task;
  area: Area | undefined;
  goals: Goal[];
  assignees: Assignee[];
}) {
  if (task.status !== "triage") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 text-sm">
        <span className="min-w-0 flex-1 font-medium text-[#2a2a33]">{task.title}</span>
        <span className="rounded-md bg-[#f4f4f8] px-2 py-0.5 text-[10px] font-bold text-[#9a9aa8]">P{task.priority}</span>
      </div>
    );
  }

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
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#1c1c24]">{task.title}</span>
            {task.subtype && (
              <span className="rounded-full bg-[#f4f4f8] px-2 py-0.5 text-[10px] font-semibold text-[#9a9aa8]">{task.subtype}</span>
            )}
          </div>
          {area && (
            <div className="mt-1">
              <AreaTag name={area.name} colorToken={area.colorToken} />
            </div>
          )}
        </div>
        <div className="flex gap-2 text-xs">
          <button type="button" className="font-semibold text-[#6d4aff] hover:underline" onClick={() => setMode(mode === "goal" ? "none" : "goal")}>
            Assign
          </button>
          <button type="button" className="font-semibold text-[#6d4aff] hover:underline" onClick={() => setMode(mode === "delegate" ? "none" : "delegate")}>
            Delegate
          </button>
          <button
            type="button"
            className="text-[#9a9aa8] hover:underline"
            onClick={() => {
              if (confirm("Delete this item?")) startTransition(() => deleteFromTriage(task.id));
            }}
          >
            Delete
          </button>
        </div>
      </div>

      {mode === "goal" && (
        <div className="mt-3 space-y-2 border-t border-[#f4f4f8] pt-3">
          {needsRepro && (
            <>
              <textarea
                className="w-full rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
                placeholder={task.subtype === "bug" ? "Repro steps" : "Observation"}
                value={definitionOfDone}
                onChange={(e) => setDefinitionOfDone(e.target.value)}
                rows={2}
              />
              <select
                className="rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
                value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
              >
                <option value="">Severity…</option>
                {Object.entries(SEVERITY_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {v} — {label}
                  </option>
                ))}
              </select>
            </>
          )}
          {needsHypothesis && (
            <>
              <textarea
                className="w-full rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
                placeholder="Hypothesis"
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                rows={3}
              />
              <input
                className="w-full rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
                placeholder="Target metric"
                value={targetMetric}
                onChange={(e) => setTargetMetric(e.target.value)}
              />
            </>
          )}
          {!needsRepro && !needsHypothesis && (
            <textarea
              className="w-full rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
              placeholder="Definition of done"
              value={definitionOfDone}
              onChange={(e) => setDefinitionOfDone(e.target.value)}
              rows={2}
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
            >
              <option value="">No goal — send to backlog</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-md bg-[#17181f] px-3 py-1.5 text-xs font-semibold text-white"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  try {
                    const payload = {
                      definitionOfDone,
                      severity: severity === "" ? null : Number(severity),
                      hypothesis,
                      targetMetric,
                    };
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
        <div className="mt-3 space-y-2 border-t border-[#f4f4f8] pt-3">
          <select
            className="rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.reliability})
              </option>
            ))}
          </select>
          <textarea
            className="w-full rounded-md border border-[#e6e6ee] px-2 py-1.5 text-sm"
            placeholder="Acceptance criteria"
            value={definitionOfDone}
            onChange={(e) => setDefinitionOfDone(e.target.value)}
            rows={2}
          />
          <button
            type="button"
            className="rounded-md bg-[#17181f] px-3 py-1.5 text-xs font-semibold text-white"
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

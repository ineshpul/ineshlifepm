"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AreaTag } from "@/components/AreaTag";
import { btnDangerGhost, btnGhost, btnPrimary, btnSecondary, fieldInput, fieldSelect } from "@/components/nesh/nesh-ui";
import { areaHex } from "@/lib/area-styles";
import { formatDate } from "@/lib/dates";
import { GOAL_STATUS_LABELS, normalizeGoal, normalizeInitiative } from "@/lib/goal-utils";
import type { Area, Goal, GoalProgressLog, GoalStatus, Initiative, Task, VisionItem } from "@/lib/types";
import {
  addGoalStepTask,
  createTasksFromActionLines,
  deleteGoal,
  deleteGoalStepTask,
  logGoalProgress,
  removeGoalProgressLog,
  saveGoalWorkspace,
  upsertGoal,
} from "./actions";
import { completeTask } from "@/app/today/actions";

const TERMINAL = ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"];

function progressFor(goalId: string, tasks: Task[]) {
  const steps = tasks.filter((t) => t.goalId === goalId);
  const closed = steps.filter((t) => TERMINAL.includes(t.status)).length;
  return { steps, closed, total: steps.length };
}

function fieldLabel(title: string, hint?: string) {
  return (
    <div className="mb-1.5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#9a9aa8]">{title}</div>
      {hint ? <div className="text-[12px] text-[#a7a7b3]">{hint}</div> : null}
    </div>
  );
}

export function GoalsClient({
  areas,
  goals,
  tasks,
  visionItems,
  initiatives,
  progressByGoal,
}: {
  areas: Area[];
  goals: Goal[];
  tasks: Task[];
  visionItems: VisionItem[];
  initiatives: Initiative[];
  progressByGoal: Record<string, GoalProgressLog[]>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creatingArea, setCreatingArea] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const router = useRouter();

  const sortedAreas = useMemo(() => [...areas].sort((a, b) => a.sortOrder - b.sortOrder), [areas]);

  const visionById = new Map(visionItems.map((v) => [v.id, v]));

  const goalsByArea = new Map<string, Goal[]>();
  for (const g of goals.map(normalizeGoal)) {
    if (!goalsByArea.has(g.areaId)) goalsByArea.set(g.areaId, []);
    goalsByArea.get(g.areaId)!.push(g);
  }

  return (
    <div className="nesh-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13.5px] leading-relaxed text-[#6b6f7d]">
          Hierarchy: <strong className="font-semibold text-[#17181f]">Area → Sector → Goal → Task</strong>. Create sectors
          on the Sectors tab (e.g. IU engagement, Technical tickets, Marketing), attach goals, then break goals into tasks.
        </p>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            const first = sortedAreas[0]?.id ?? null;
            if (first) setCreatingArea(creatingArea ? null : first);
          }}
          disabled={sortedAreas.length === 0}
        >
          + New goal
        </button>
      </div>
      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      ) : null}
      {saveNote ? <p className="mb-4 text-sm text-[#2fae5b]">{saveNote}</p> : null}
      {sortedAreas.length === 0 ? (
        <p className="text-sm text-[#9a9aa8]">No life areas yet — add areas in Settings, then create goals here.</p>
      ) : null}
      <div className="space-y-8">
        {sortedAreas.map((area) => {
          const areaGoals = (goalsByArea.get(area.id) ?? []).sort((a, b) => b.priority - a.priority);
          const hex = areaHex(area.colorToken);
          return (
            <section key={area.id}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: hex }} />
                <span className="font-display text-[15px] font-bold">{area.name}</span>
                <span className="text-xs font-medium text-[#a7a7b3]">{areaGoals.length} goals</span>
                <button
                  type="button"
                  className={`${btnGhost} ml-auto text-xs`}
                  onClick={() => setCreatingArea(creatingArea === area.id ? null : area.id)}
                >
                  + New goal
                </button>
              </div>

              {creatingArea === area.id && (
                <NewGoalForm
                  areaId={area.id}
                  areas={sortedAreas}
                  initiatives={initiatives.filter((i) => i.areaId === area.id)}
                  onSuccess={(goalId) => {
                    setCreatingArea(null);
                    setError(null);
                    setExpanded(goalId);
                    setSaveNote("Goal created.");
                    router.refresh();
                  }}
                  onCancel={() => setCreatingArea(null)}
                  onError={setError}
                />
              )}

              {areaGoals.length === 0 && initiatives.filter((i) => i.areaId === area.id).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#dcdce4] bg-white px-5 py-6 text-center text-[13px] text-[#a7a7b3]">
                  No sectors or goals in {area.name} yet.{" "}
                  <Link href="/initiatives" className="font-semibold text-[#6d4aff] hover:underline">
                    Add a sector
                  </Link>{" "}
                  or{" "}
                  <button
                    type="button"
                    className="font-semibold text-[#6d4aff] hover:underline"
                    onClick={() => setCreatingArea(area.id)}
                  >
                    add a goal
                  </button>
                  .
                </div>
              ) : (
                <div className="space-y-5">
                  {[
                    ...initiatives
                      .filter((i) => i.areaId === area.id)
                      .map(normalizeInitiative)
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                      .map((i) => ({ id: i.id as string | null, title: i.title })),
                    { id: null, title: "No sector" },
                  ].map((sector) => {
                    const sectorGoals = areaGoals.filter((g) =>
                      sector.id ? g.initiativeId === sector.id : !g.initiativeId
                    );
                    if (sector.id && sectorGoals.length === 0) return null;
                    return (
                      <div key={sector.id ?? "none"}>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#9a9aa8]">{sector.title}</h3>
                        {sectorGoals.length === 0 ? (
                          <p className="text-xs text-[#a7a7b3]">No goals in this sector.</p>
                        ) : (
                          <div className="card overflow-hidden">
                            {sectorGoals.map((g, idx) => (
                              <GoalRow
                                key={g.id}
                                g={g}
                                idx={idx}
                                hex={hex}
                                expanded={expanded}
                                setExpanded={setExpanded}
                                tasks={tasks}
                                initiatives={initiatives}
                                visionById={visionById}
                                progressLogs={progressByGoal[g.id] ?? []}
                                isPending={isPending}
                                startTransition={startTransition}
                                setSaveNote={setSaveNote}
                                setError={setError}
                                router={router}
                              />
                            ))}
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
      </div>
    </div>
  );
}

function GoalRow({
  g,
  idx,
  hex,
  expanded,
  setExpanded,
  tasks,
  initiatives,
  visionById,
  progressLogs,
  isPending,
  startTransition,
  setSaveNote,
  setError,
  router,
}: {
  g: Goal;
  idx: number;
  hex: string;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  tasks: Task[];
  initiatives: Initiative[];
  visionById: Map<string, VisionItem>;
  progressLogs: GoalProgressLog[];
  isPending: boolean;
  startTransition: (fn: () => void) => void;
  setSaveNote: (m: string | null) => void;
  setError: (e: string | null) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const { steps, closed, total } = progressFor(g.id, tasks);
  const pct = total ? Math.round((closed / total) * 100) : g.status === "done" ? 100 : 0;
  const isOpen = expanded === g.id;
  const statusLabel = GOAL_STATUS_LABELS[g.status];

  return (
    <div className={`px-5 py-4 ${idx > 0 ? "border-t border-[#f4f4f8]" : ""}`}>
      <button
        type="button"
        className="flex w-full items-center gap-4 text-left"
        onClick={() => setExpanded(isOpen ? null : g.id)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[#f4f4f8] px-1.5 py-0.5 text-[11px] font-bold text-[#9a9aa8]">P{g.priority}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                g.status === "done"
                  ? "bg-[#e7f7ec] text-[#2fae5b]"
                  : g.status === "active"
                    ? "bg-[#eceaf5] text-[#6d4aff]"
                    : "bg-[#f4f4f8] text-[#9a9aa8]"
              }`}
            >
              {statusLabel}
            </span>
            {g.isQuantifiable ? (
              <span className="rounded-full bg-[#e8eeff] px-2 py-0.5 text-[10px] font-bold text-[#2f6bff]">Daily track</span>
            ) : null}
            <span className="text-[14.5px] font-semibold text-[#1c1c24]">{g.title}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-[12.5px] text-[#8d8d99]">
            {g.successDefinition || g.currentState || "Tap to add detail…"}
          </p>
        </div>
        <div className="w-[190px] shrink-0">
          <div className="mb-1 flex justify-between text-[11.5px] text-[#9a9aa8]">
            <span className="font-semibold" style={{ color: hex }}>
              {pct}%
            </span>
            <span>
              {closed}/{total} steps
            </span>
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

      {isOpen ? (
        <GoalWorkspace
          goal={g}
          areaHex={hex}
          steps={steps}
          closed={closed}
          total={total}
          pct={pct}
          initiatives={initiatives.filter((i) => i.areaId === g.areaId)}
          visionTitle={g.visionItemId ? visionById.get(g.visionItemId)?.title : undefined}
          progressLogs={progressLogs}
          pending={isPending}
          startTransition={startTransition}
          onSaved={(msg) => {
            setSaveNote(msg);
            router.refresh();
          }}
          onError={setError}
          onDeleted={() => {
            setExpanded(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function GoalWorkspace({
  goal,
  areaHex: hex,
  steps,
  closed,
  total,
  pct,
  initiatives,
  visionTitle,
  progressLogs,
  pending,
  startTransition,
  onSaved,
  onError,
  onDeleted,
}: {
  goal: Goal;
  areaHex: string;
  steps: Task[];
  closed: number;
  total: number;
  pct: number;
  initiatives: Initiative[];
  visionTitle?: string;
  progressLogs: GoalProgressLog[];
  pending: boolean;
  startTransition: (fn: () => void) => void;
  onSaved: (msg: string) => void;
  onError: (e: string | null) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [successDefinition, setSuccessDefinition] = useState(goal.successDefinition);
  const [currentState, setCurrentState] = useState(goal.currentState);
  const [actionItems, setActionItems] = useState(goal.actionItems);
  const [solution, setSolution] = useState(goal.solution);
  const [status, setStatus] = useState<GoalStatus>(goal.status);
  const [priority, setPriority] = useState(goal.priority);
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? "");
  const [initiativeId, setInitiativeId] = useState(goal.initiativeId ?? "");
  const [isQuantifiable, setIsQuantifiable] = useState(goal.isQuantifiable);
  const [trackUnit, setTrackUnit] = useState(goal.trackUnit);
  const [trackTargetPerDay, setTrackTargetPerDay] = useState(
    goal.trackTargetPerDay != null ? String(goal.trackTargetPerDay) : ""
  );
  const [logDate, setLogDate] = useState(new Date().toISOString().slice(0, 10));
  const [logValue, setLogValue] = useState("");
  const [logNote, setLogNote] = useState("");
  const [newStep, setNewStep] = useState("");
  const [localNote, setLocalNote] = useState<string | null>(null);

  useEffect(() => {
    const g = normalizeGoal(goal);
    setTitle(g.title);
    setSuccessDefinition(g.successDefinition);
    setCurrentState(g.currentState);
    setActionItems(g.actionItems);
    setSolution(g.solution);
    setStatus(g.status);
    setPriority(g.priority);
    setTargetDate(g.targetDate ?? "");
    setInitiativeId(g.initiativeId ?? "");
    setIsQuantifiable(g.isQuantifiable);
    setTrackUnit(g.trackUnit);
    setTrackTargetPerDay(g.trackTargetPerDay != null ? String(g.trackTargetPerDay) : "");
  }, [goal]);

  const save = () => {
    onError(null);
    startTransition(async () => {
      try {
        await saveGoalWorkspace({
          id: goal.id,
          title,
          successDefinition,
          currentState,
          actionItems,
          solution,
          status,
          targetDate: targetDate || null,
          priority,
          initiativeId: initiativeId || null,
          isQuantifiable,
          trackUnit,
          trackTargetPerDay: trackTargetPerDay.trim() ? Number(trackTargetPerDay) : null,
        });
        onSaved("Goal saved.");
      } catch (e) {
        onError(e instanceof Error ? e.message : "Could not save.");
      }
    });
  };

  const resolved = status === "done";

  return (
    <div className="mt-5 space-y-5 border-t border-[#f4f4f8] pt-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          {fieldLabel("Goal title")}
          <input className={fieldInput} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          {fieldLabel("Status")}
          <select className={`${fieldSelect} w-full`} value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            {(Object.keys(GOAL_STATUS_LABELS) as GoalStatus[]).map((s) => (
              <option key={s} value={s}>
                {GOAL_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          {fieldLabel("Priority")}
          <select className={`${fieldSelect} w-full`} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
        </div>
        <div>
          {fieldLabel("Target date")}
          <input type="date" className={fieldInput} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </div>
        {initiatives.length > 0 ? (
          <div className="sm:col-span-2">
            {fieldLabel("Sector (initiative)")}
            <select className={`${fieldSelect} w-full`} value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
              <option value="">No sector</option>
              {initiatives.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-[#ececf1] bg-[#fafafb] p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={isQuantifiable} onChange={(e) => setIsQuantifiable(e.target.checked)} />
          Quantifiable — log a number each day (e.g. outreach sent, bugs closed)
        </label>
        {isQuantifiable ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className={fieldInput}
              placeholder="Unit (e.g. tickets, posts)"
              value={trackUnit}
              onChange={(e) => setTrackUnit(e.target.value)}
            />
            <input
              className={fieldInput}
              placeholder="Daily target (optional)"
              value={trackTargetPerDay}
              onChange={(e) => setTrackTargetPerDay(e.target.value)}
            />
          </div>
        ) : null}
        {isQuantifiable ? (
          <div className="mt-4">
            {fieldLabel("Daily log")}
            <div className="mb-2 flex flex-wrap gap-2">
              <input type="date" className={fieldInput} value={logDate} onChange={(e) => setLogDate(e.target.value)} />
              <input
                className={fieldInput}
                placeholder="Value"
                value={logValue}
                onChange={(e) => setLogValue(e.target.value)}
              />
              <input
                className={`${fieldInput} min-w-[140px] flex-1`}
                placeholder="Note (optional)"
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
              />
              <button
                type="button"
                className={btnSecondary}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      await logGoalProgress({
                        goalId: goal.id,
                        date: logDate,
                        value: logValue.trim() ? Number(logValue) : null,
                        note: logNote,
                      });
                      setLogValue("");
                      setLogNote("");
                      onSaved("Day logged.");
                    } catch (e) {
                      onError(e instanceof Error ? e.message : "Could not log.");
                    }
                  })
                }
              >
                Log day
              </button>
            </div>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-[#6b6f7d]">
              {progressLogs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1">
                  <span>
                    {formatDate(l.date)} — {l.value != null ? `${l.value}${trackUnit ? ` ${trackUnit}` : ""}` : "—"}{" "}
                    {l.note ? `· ${l.note}` : ""}
                  </span>
                  <button
                    type="button"
                    className="text-[#9a9aa8] hover:text-[#c95a2b]"
                    onClick={() =>
                      startTransition(async () => {
                        await removeGoalProgressLog(l.id);
                        onSaved("Log removed.");
                      })
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
              {progressLogs.length === 0 ? <li className="text-[#a7a7b3]">No daily entries yet.</li> : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div>
        {fieldLabel("Definition of done", "Numeric or plain yes/no — required before “In progress”.")}
        <textarea
          className={`${fieldInput} min-h-[72px]`}
          value={successDefinition}
          onChange={(e) => setSuccessDefinition(e.target.value)}
          placeholder="e.g. 15 applications sent, or “IU incentive doc signed off”"
        />
      </div>

      <div>
        {fieldLabel("Current state", "What’s true right now? Blockers, open questions, latest update.")}
        <textarea
          className={`${fieldInput} min-h-[88px]`}
          value={currentState}
          onChange={(e) => setCurrentState(e.target.value)}
          placeholder="Where this goal actually stands today…"
        />
      </div>

      <div className="rounded-xl border border-[#ececf1] bg-[#fbfbfd] p-4">
        {fieldLabel("Progress", "Check off steps linked to this goal. Add new steps below.")}
        <div className="mb-3 flex items-center gap-3">
          <div className="flex-1">
            <div className="mb-1 flex justify-between text-xs font-semibold text-[#6b6f7d]">
              <span style={{ color: hex }}>{pct}%</span>
              <span>
                {closed}/{total} steps done
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-[#ececf1]">
              <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: hex }} />
            </div>
          </div>
        </div>
        {steps.length === 0 ? (
          <p className="text-xs text-[#9a9aa8]">No steps yet — add an action item or a step below.</p>
        ) : (
          <ul className="space-y-2">
            {steps.map((s) => {
              const done = TERMINAL.includes(s.status);
              return (
                <li key={s.id} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <button
                    type="button"
                    className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-2 text-[10px]"
                    style={{
                      borderColor: done ? hex : "#d8d8e2",
                      background: done ? hex : "transparent",
                      color: done ? "#fff" : "transparent",
                    }}
                    disabled={pending || done}
                    onClick={() =>
                      startTransition(async () => {
                        await completeTask(s.id);
                        onSaved("Step completed.");
                      })
                    }
                  >
                    {done ? "✓" : ""}
                  </button>
                  <span className={done ? "text-[#a7a7b3] line-through" : "text-[#2a2a33]"}>{s.title}</span>
                  <button
                    type="button"
                    className="ml-auto text-[11px] font-semibold text-[#9a9aa8] hover:text-[#c95a2b]"
                    disabled={pending}
                    onClick={() => {
                      if (!confirm(`Remove step “${s.title}”?`)) return;
                      startTransition(async () => {
                        const res = await deleteGoalStepTask(s.id);
                        if (res.ok) onSaved("Step removed.");
                        else onError(res.message);
                      });
                    }}
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <input
            className={`${fieldInput} flex-1`}
            placeholder="Add a step (creates a linked task)…"
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newStep.trim()) {
                startTransition(async () => {
                  const res = await addGoalStepTask(goal.id, newStep.trim());
                  if (res.ok) {
                    setNewStep("");
                    onSaved(res.message);
                  }
                });
              }
            }}
          />
          <button
            type="button"
            className={btnSecondary}
            disabled={pending || !newStep.trim()}
            onClick={() =>
              startTransition(async () => {
                const res = await addGoalStepTask(goal.id, newStep.trim());
                if (res.ok) {
                  setNewStep("");
                  onSaved(res.message);
                }
              })
            }
          >
            Add step
          </button>
        </div>
      </div>

      <div>
        {fieldLabel("Action items", "Concrete next moves — one per line. Turn them into tasks when ready.")}
        <textarea
          className={`${fieldInput} min-h-[88px]`}
          value={actionItems}
          onChange={(e) => setActionItems(e.target.value)}
          placeholder={"Draft outreach email\nBook call with Crimson Consulting\n…"}
        />
        <button
          type="button"
          className={`${btnSecondary} mt-2`}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveGoalWorkspace({
                id: goal.id,
                title,
                successDefinition,
                currentState,
                actionItems,
                solution,
                status,
                targetDate: targetDate || null,
                priority,
                initiativeId: initiativeId || null,
                isQuantifiable,
                trackUnit,
                trackTargetPerDay: trackTargetPerDay.trim() ? Number(trackTargetPerDay) : null,
              });
              const res = await createTasksFromActionLines(goal.id);
              setLocalNote(res.message);
              if (res.ok) onSaved(res.message);
            })
          }
        >
          Create tasks from lines
        </button>
      </div>

      <div
        className={`rounded-xl border p-4 ${resolved ? "border-[#c9edd4] bg-[#f3fbf6]" : "border-[#ececf1] bg-white"}`}
      >
        {fieldLabel(
          resolved ? "Resolved — solution / outcome" : "Solution / outcome (when resolved)",
          "What shipped, what you learned, or how you know it’s done."
        )}
        <textarea
          className={`${fieldInput} min-h-[88px]`}
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          placeholder="When this goal is done, capture the answer here…"
        />
        {!resolved ? (
          <button
            type="button"
            className={`${btnSecondary} mt-2`}
            disabled={pending}
            onClick={() => {
              setStatus("done");
              onError(null);
            }}
          >
            Mark as resolved
          </button>
        ) : (
          <p className="mt-2 text-xs font-semibold text-[#2fae5b]">This goal is marked resolved.</p>
        )}
      </div>

      {visionTitle ? (
        <p className="text-xs text-[#9a9aa8]">
          Linked vision: <span className="font-semibold text-[#6b6f7d]">{visionTitle}</span>
        </p>
      ) : null}

      {localNote ? <p className="text-xs text-[#2fae5b]">{localNote}</p> : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-[#f4f4f8] pt-4">
        <button type="button" className={btnPrimary} disabled={pending || !title.trim()} onClick={save}>
          Save goal
        </button>
        <Link href="/triage" className={`${btnGhost} text-sm`}>
          Open tasks →
        </Link>
        <button
          type="button"
          className={`${btnDangerGhost} ml-auto text-xs`}
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete goal “${goal.title}”?`)) {
              startTransition(async () => {
                const res = await deleteGoal(goal.id);
                if (res.ok) onDeleted();
                else onError(res.message);
              });
            }
          }}
        >
          Delete goal
        </button>
      </div>
    </div>
  );
}

function NewGoalForm({
  areaId,
  areas,
  initiatives,
  onSuccess,
  onCancel,
  onError,
}: {
  areaId: string;
  areas: Area[];
  initiatives: Initiative[];
  onSuccess: (goalId: string) => void;
  onCancel: () => void;
  onError: (e: string | null) => void;
}) {
  const [pickAreaId, setPickAreaId] = useState(areaId);
  const [title, setTitle] = useState("");
  const [successDefinition, setSuccessDefinition] = useState("");
  const [currentState, setCurrentState] = useState("");
  const [priority, setPriority] = useState(3);
  const [targetDate, setTargetDate] = useState("");
  const [initiativeId, setInitiativeId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPickAreaId(areaId);
  }, [areaId]);

  async function save() {
    onError(null);
    setSaving(true);
    try {
      const res = await upsertGoal({
        areaId: pickAreaId,
        initiativeId: initiativeId || null,
        title: title.trim(),
        successDefinition,
        currentState,
        actionItems: "",
        solution: "",
        targetDate: targetDate || null,
        priority,
        status: "not_started",
        visionItemId: null,
      });
      if (!res.ok) {
        onError(res.message);
        return;
      }
      onSuccess(res.goal.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not save goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card mb-3 space-y-3 p-4">
      <select className={fieldSelect} value={pickAreaId} onChange={(e) => setPickAreaId(e.target.value)}>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input className={fieldInput} placeholder="Goal title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className={`${fieldInput} min-h-[64px]`}
        placeholder="Definition of done (optional until you go in progress)"
        value={successDefinition}
        onChange={(e) => setSuccessDefinition(e.target.value)}
        rows={2}
      />
      <textarea
        className={`${fieldInput} min-h-[64px]`}
        placeholder="Current state (optional)"
        value={currentState}
        onChange={(e) => setCurrentState(e.target.value)}
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <select className={fieldSelect} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>
              Priority {p}
            </option>
          ))}
        </select>
        <input type="date" className={fieldInput} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        {initiatives.length > 0 && (
          <select className={fieldSelect} value={initiativeId} onChange={(e) => setInitiativeId(e.target.value)}>
            <option value="">Pick sector (recommended)</option>
            {initiatives.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          className={btnPrimary}
          disabled={saving || !title.trim()}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save goal"}
        </button>
        <button type="button" className="text-xs text-[#9a9aa8] hover:underline" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

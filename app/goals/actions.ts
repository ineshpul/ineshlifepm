"use server";

import { revalidatePath } from "next/cache";
import {
  getGoal,
  saveGoal,
  saveTask,
  getTask,
  listTasks,
  listVisionItems,
  saveVisionItem,
  listInitiatives,
  getInitiative,
  saveInitiative,
  deleteTask,
  listGoalProgressLogs,
  saveGoalProgressLog,
  deleteGoalProgressLog,
  newId,
  nowIso,
  deleteGoal as removeGoal,
} from "@/lib/repo";
import { normalizeGoal } from "@/lib/goal-utils";
import type { Goal, GoalStatus, Task } from "@/lib/types";

export type GoalActionResult =
  | { ok: true; goal: Goal }
  | { ok: false; message: string };

export async function upsertGoal(input: {
  id?: string;
  areaId: string;
  initiativeId: string | null;
  title: string;
  successDefinition: string;
  targetDate: string | null;
  priority: number;
  status: GoalStatus;
  visionItemId: string | null;
  currentState?: string;
  actionItems?: string;
  solution?: string;
  isQuantifiable?: boolean;
  trackUnit?: string;
  trackTargetPerDay?: number | null;
}): Promise<GoalActionResult> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Enter a goal title." };
  if (!input.areaId?.trim()) return { ok: false, message: "Pick a life area." };
  if (input.status === "active" && !input.successDefinition.trim()) {
    return { ok: false, message: "Add a definition of done before marking in progress." };
  }

  const existing = input.id ? await getGoal(input.id) : null;

  const goal: Goal = normalizeGoal({
    id: input.id ?? newId("goal"),
    areaId: input.areaId,
    initiativeId: input.initiativeId,
    title,
    successDefinition: input.successDefinition,
    targetDate: input.targetDate,
    priority: input.priority,
    status: input.status,
    visionItemId: input.visionItemId,
    currentState: input.currentState ?? existing?.currentState ?? "",
    actionItems: input.actionItems ?? existing?.actionItems ?? "",
    solution: input.solution ?? existing?.solution ?? "",
    isQuantifiable: input.isQuantifiable ?? existing?.isQuantifiable ?? false,
    trackUnit: input.trackUnit ?? existing?.trackUnit ?? "",
    trackTargetPerDay:
      input.trackTargetPerDay !== undefined ? input.trackTargetPerDay : (existing?.trackTargetPerDay ?? null),
  });

  try {
    await saveGoal(goal);
    if (goal.initiativeId) {
      const init = await getInitiative(goal.initiativeId);
      if (init && !init.goalIds.includes(goal.id)) {
        await saveInitiative({ ...init, goalIds: [...init.goalIds, goal.id] });
      }
    }
    revalidatePath("/goals");
    return { ok: true, goal };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save goal." };
  }
}

export async function saveGoalWorkspace(input: {
  id: string;
  title: string;
  successDefinition: string;
  currentState: string;
  actionItems: string;
  solution: string;
  status: GoalStatus;
  targetDate: string | null;
  priority: number;
  initiativeId: string | null;
  isQuantifiable: boolean;
  trackUnit: string;
  trackTargetPerDay: number | null;
}) {
  const existing = await getGoal(input.id);
  if (!existing) throw new Error("Goal not found.");

  if (input.status === "active" && !input.successDefinition.trim()) {
    throw new Error("Add a definition of done before marking in progress.");
  }

  const goal: Goal = normalizeGoal({
    ...existing,
    title: input.title.trim(),
    successDefinition: input.successDefinition,
    currentState: input.currentState,
    actionItems: input.actionItems,
    solution: input.solution,
    status: input.status,
    targetDate: input.targetDate,
    priority: input.priority,
    initiativeId: input.initiativeId,
    isQuantifiable: input.isQuantifiable,
    trackUnit: input.trackUnit,
    trackTargetPerDay: input.trackTargetPerDay,
  });

  await saveGoal(goal);
  revalidatePath("/goals");
  revalidatePath("/today");
}

export async function addGoalStepTask(goalId: string, title: string) {
  const titleTrim = title.trim();
  if (!titleTrim) return { ok: false as const, message: "Enter a step title." };

  const goal = await getGoal(goalId);
  if (!goal) throw new Error("Goal not found.");

  const task: Task = {
    id: newId("task"),
    areaId: goal.areaId,
    goalId: goal.id,
    initiativeId: goal.initiativeId,
    type: "build",
    subtype: null,
    title: titleTrim,
    definitionOfDone: null,
    size: "M",
    estimateMinutes: null,
    actualMinutes: null,
    priority: goal.priority,
    severity: null,
    dueAt: null,
    scheduledAt: null,
    assigneeId: null,
    status: "specced",
    createdAt: nowIso(),
    closedAt: null,
    lastTouchedAt: nowIso(),
    hypothesis: null,
    targetMetric: null,
    artifactDefinition: null,
    cadenceRuleId: null,
    committedForDate: null,
    droppedReason: null,
  };

  await saveTask(task);
  revalidatePath("/goals");
  revalidatePath("/triage");
  return { ok: true as const, message: "Step added to this goal." };
}

export async function createTasksFromActionLines(goalId: string) {
  const goal = await getGoal(goalId);
  if (!goal) throw new Error("Goal not found.");
  const lines = (goal.actionItems ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { ok: false as const, message: "Add action items (one per line) first." };
  }
  for (const line of lines) {
    await addGoalStepTask(goalId, line);
  }
  revalidatePath("/goals");
  revalidatePath("/triage");
  return { ok: true as const, message: `Created ${lines.length} task${lines.length === 1 ? "" : "s"} from action items.` };
}

export async function deleteGoal(goalId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const tasks = await listTasks();
    for (const t of tasks.filter((x) => x.goalId === goalId)) {
      await saveTask({ ...t, goalId: null, lastTouchedAt: nowIso() });
    }
    for (const v of await listVisionItems()) {
      if (v.linkedGoalIds.includes(goalId)) {
        await saveVisionItem({
          ...v,
          linkedGoalIds: v.linkedGoalIds.filter((id) => id !== goalId),
          status: v.linkedGoalIds.length <= 1 && v.status === "active" ? "dormant" : v.status,
        });
      }
    }
    for (const i of await listInitiatives()) {
      if (i.goalIds.includes(goalId)) {
        await saveInitiative({ ...i, goalIds: i.goalIds.filter((id) => id !== goalId) });
      }
    }
    await removeGoal(goalId);
    revalidatePath("/goals");
    revalidatePath("/vision");
    revalidatePath("/initiatives");
    revalidatePath("/triage");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete goal." };
  }
}

export async function deleteGoalStepTask(taskId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const task = await getTask(taskId);
  if (!task) return { ok: false, message: "Step not found." };
  try {
    await deleteTask(taskId);
    revalidatePath("/goals");
    revalidatePath("/triage");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not delete step." };
  }
}

export async function logGoalProgress(input: {
  goalId: string;
  date: string;
  value: number | null;
  note: string;
}) {
  const goal = await getGoal(input.goalId);
  if (!goal) throw new Error("Goal not found.");
  if (!goal.isQuantifiable) throw new Error("Turn on quantifiable tracking for this goal first.");

  const log = {
    id: newId("gplog"),
    goalId: input.goalId,
    date: input.date,
    value: input.value,
    note: input.note.trim(),
    workspaceId: goal.workspaceId,
  };
  await saveGoalProgressLog(log);
  revalidatePath("/goals");
}

export async function removeGoalProgressLog(logId: string) {
  await deleteGoalProgressLog(logId);
  revalidatePath("/goals");
}

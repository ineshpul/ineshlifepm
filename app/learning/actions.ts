"use server";

import { revalidatePath } from "next/cache";
import { listTasks, getTask, saveTask, deleteTask, newId, nowIso } from "@/lib/repo";
import type { Task } from "@/lib/types";

export async function createLearningItem(title: string, areaId: string, artifactDefinition: string) {
  const task: Task = {
    id: newId("task"),
    areaId,
    goalId: null,
    initiativeId: null,
    type: "learning",
    subtype: null,
    title,
    definitionOfDone: null,
    size: null,
    estimateMinutes: null,
    actualMinutes: null,
    priority: 3,
    severity: null,
    dueAt: null,
    scheduledAt: null,
    assigneeId: null,
    status: "backlog",
    createdAt: nowIso(),
    closedAt: null,
    lastTouchedAt: nowIso(),
    hypothesis: null,
    targetMetric: null,
    artifactDefinition: artifactDefinition || null,
    cadenceRuleId: null,
    committedForDate: null,
    droppedReason: null,
  };
  await saveTask(task);
  revalidatePath("/learning");
}

export async function activateLearningItem(taskId: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error("Not found.");
  if (!task.artifactDefinition?.trim()) {
    throw new Error("Define the artifact before moving this into active.");
  }
  const all = await listTasks();
  const activeCount = all.filter((t) => t.type === "learning" && t.status === "active").length;
  if (activeCount >= 2) {
    // §9.7 CRITICAL: active pane hard-caps at 2.
    throw new Error("Active is capped at 2. Close or return one before activating another.");
  }
  await saveTask({ ...task, status: "active", lastTouchedAt: nowIso() });
  revalidatePath("/learning");
}

export async function returnToBacklog(taskId: string) {
  const task = await getTask(taskId);
  if (!task) return;
  await saveTask({ ...task, status: "backlog", lastTouchedAt: nowIso() });
  revalidatePath("/learning");
}

export async function closeLearningItem(taskId: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error("Not found.");
  if (!task.artifactDefinition?.trim()) {
    throw new Error("Closes only when the artifact exists — define it first.");
  }
  await saveTask({ ...task, status: "artifact_produced", closedAt: nowIso(), lastTouchedAt: nowIso() });
  revalidatePath("/learning");
}

export async function deleteLearningItem(taskId: string) {
  const task = await getTask(taskId);
  if (!task || task.type !== "learning") return;
  await deleteTask(taskId);
  revalidatePath("/learning");
}

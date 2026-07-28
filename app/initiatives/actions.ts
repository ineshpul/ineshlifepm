"use server";

import { revalidatePath } from "next/cache";
import { getInitiative, saveInitiative, deleteInitiative, getSettings, saveTask, newId, nowIso } from "@/lib/repo";
import type { Initiative, InitiativeStatus, Task } from "@/lib/types";

export async function createInitiative(input: {
  areaId: string;
  title: string;
  planBody: string;
  targetDate: string | null;
  sortOrder?: number;
}) {
  const initiative: Initiative = {
    id: newId("init"),
    areaId: input.areaId,
    title: input.title,
    planBody: input.planBody,
    status: "planning",
    ownerId: null,
    startedAt: nowIso(),
    targetDate: input.targetDate,
    restartAt: null,
    outcomeNotes: [],
    metricIds: [],
    goalIds: [],
    sortOrder: input.sortOrder ?? 0,
  };
  await saveInitiative(initiative);
  revalidatePath("/initiatives");
  return initiative;
}

export async function updatePlanBody(id: string, planBody: string) {
  const initiative = await getInitiative(id);
  if (!initiative) return;
  await saveInitiative({ ...initiative, planBody });
  revalidatePath(`/initiatives/${id}`);
}

export async function addOutcomeNote(id: string, body: string) {
  const initiative = await getInitiative(id);
  if (!initiative) return;
  await saveInitiative({
    ...initiative,
    outcomeNotes: [...initiative.outcomeNotes, { date: nowIso(), body }],
  });
  revalidatePath(`/initiatives/${id}`);
}

export async function updateInitiativeStatus(id: string, status: InitiativeStatus, extras?: {
  ownerId?: string | null;
  restartAt?: string | null;
}) {
  const initiative = await getInitiative(id);
  if (!initiative) return;
  await saveInitiative({
    ...initiative,
    status,
    ownerId: extras?.ownerId !== undefined ? extras.ownerId : initiative.ownerId,
    restartAt: extras?.restartAt !== undefined ? extras.restartAt : initiative.restartAt,
  });
  revalidatePath(`/initiatives/${id}`);
  revalidatePath("/initiatives");
}

export async function linkGoalToInitiative(id: string, goalId: string) {
  const initiative = await getInitiative(id);
  if (!initiative) return;
  if (!initiative.goalIds.includes(goalId)) {
    await saveInitiative({ ...initiative, goalIds: [...initiative.goalIds, goalId] });
  }
  revalidatePath(`/initiatives/${id}`);
}

export async function linkMetricToInitiative(id: string, metricId: string) {
  const initiative = await getInitiative(id);
  if (!initiative) return;
  if (!initiative.metricIds.includes(metricId)) {
    await saveInitiative({ ...initiative, metricIds: [...initiative.metricIds, metricId] });
  }
  revalidatePath(`/initiatives/${id}`);
}

export async function removeInitiative(id: string) {
  await deleteInitiative(id);
  revalidatePath("/initiatives");
  revalidatePath("/goals");
}

/** Ongoing sector task — lives in triage until you schedule or commit it. */
export async function createSectorTask(initiativeId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) return { ok: false as const, message: "Enter a task title." };

  const initiative = await getInitiative(initiativeId);
  if (!initiative) return { ok: false as const, message: "Sector not found." };

  const settings = await getSettings();
  const task: Task = {
    id: newId("task"),
    areaId: initiative.areaId,
    goalId: null,
    initiativeId: initiative.id,
    type: "build",
    subtype: null,
    title: trimmed,
    definitionOfDone: null,
    size: "M",
    estimateMinutes: settings.sizeMinutes.M,
    actualMinutes: null,
    priority: 3,
    severity: null,
    dueAt: null,
    scheduledAt: null,
    assigneeId: null,
    status: "triage",
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
  revalidatePath("/initiatives");
  revalidatePath(`/initiatives/${initiativeId}`);
  revalidatePath("/triage");
  return { ok: true as const, message: "Task added to this sector." };
}

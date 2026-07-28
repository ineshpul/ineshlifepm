"use server";

import { revalidatePath } from "next/cache";
import { getInitiative, saveInitiative, newId, nowIso } from "@/lib/repo";
import type { Initiative, InitiativeStatus } from "@/lib/types";

export async function createInitiative(input: {
  areaId: string;
  title: string;
  planBody: string;
  targetDate: string | null;
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

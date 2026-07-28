"use server";

import { revalidatePath } from "next/cache";
import { parseIcsToSchoolBlocks } from "@/lib/parse-ics-import";
import { getSettings, saveSettings, getTask, saveTask, deleteTask, newId, nowIso, listAreas } from "@/lib/repo";
import { guessAreaForTask } from "@/lib/classify-area";
import type { Task } from "@/lib/types";

export async function rescheduleTask(taskId: string, scheduledAtIso: string) {
  const task = await getTask(taskId);
  if (!task) return;
  await saveTask({ ...task, scheduledAt: scheduledAtIso, lastTouchedAt: nowIso() });
  revalidatePath("/weekly");
  revalidatePath("/calendar");
}

export async function createWeeklyTask(input: {
  title: string;
  areaId?: string;
  scheduledAtIso?: string | null;
  size?: "S" | "M" | "L";
}): Promise<{ ok: boolean; message: string; areaId: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, message: "Enter a task title.", areaId: "" };

  const areas = await listAreas();
  const guessed = input.areaId
    ? { areaId: input.areaId, confidence: "high" as const, reason: "You chose this area" }
    : guessAreaForTask(title, areas);
  const settings = await getSettings();
  const size = input.size ?? "M";
  const estimateMinutes = settings.sizeMinutes[size];

  const task: Task = {
    id: newId("task"),
    areaId: guessed.areaId,
    goalId: null,
    initiativeId: null,
    type: "build",
    subtype: null,
    title,
    definitionOfDone: null,
    size,
    estimateMinutes,
    actualMinutes: null,
    priority: 3,
    severity: null,
    dueAt: null,
    scheduledAt: input.scheduledAtIso ?? null,
    assigneeId: null,
    status: input.scheduledAtIso ? "specced" : "triage",
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
  revalidatePath("/weekly");
  revalidatePath("/triage");
  revalidatePath("/today");

  const areaName = areas.find((a) => a.id === guessed.areaId)?.name ?? guessed.areaId;
  const sortNote =
    guessed.confidence === "low"
      ? ` Placed in ${areaName} — change area if needed.`
      : ` Auto-sorted to ${areaName} (${guessed.reason}).`;

  return {
    ok: true,
    message: `Task added.${sortNote}`,
    areaId: guessed.areaId,
  };
}

export async function importSchoolScheduleFromIcs(icsText: string): Promise<{ ok: boolean; message: string; count: number }> {
  const parsed = parseIcsToSchoolBlocks(icsText);
  if (parsed.length === 0) {
    return { ok: false, message: "No class events found in that file. Try a .ics export from your school calendar.", count: 0 };
  }

  const settings = await getSettings();
  const kept = settings.recurringBlocks.filter((b) => b.source !== "school");
  const imported = parsed.map((b) => ({
    ...b,
    id: newId("block"),
  }));
  await saveSettings({
    ...settings,
    recurringBlocks: [...kept, ...imported],
  });
  revalidatePath("/weekly");
  revalidatePath("/calendar");
  revalidatePath("/settings");
  return {
    ok: true,
    message: `Imported ${imported.length} school blocks onto your week (replaces previous school import).`,
    count: imported.length,
  };
}

export async function clearSchoolSchedule(): Promise<void> {
  const settings = await getSettings();
  await saveSettings({
    ...settings,
    recurringBlocks: settings.recurringBlocks.filter((b) => b.source !== "school"),
  });
  revalidatePath("/weekly");
  revalidatePath("/calendar");
}

export async function deleteWeeklyTask(taskId: string): Promise<{ ok: boolean; message: string }> {
  const task = await getTask(taskId);
  if (!task) return { ok: false, message: "Task not found." };
  await deleteTask(taskId);
  revalidatePath("/weekly");
  revalidatePath("/triage");
  revalidatePath("/today");
  return { ok: true, message: "Task deleted." };
}

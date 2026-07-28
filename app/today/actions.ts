"use server";

import { revalidatePath } from "next/cache";
import { todayDateString, startOfWeek } from "@/lib/dates";
import { freeCalendarMinutesToday } from "@/lib/capacity";
import { buildMorningProposal, availableMinutes as computeAvailableMinutes } from "@/lib/scoring";
import {
  getDay, saveDay, listTasks, saveTask, getTask, getSettings, newId, nowIso,
  listCadenceRules, saveCadenceRule,
} from "@/lib/repo";
import type { Day, Task } from "@/lib/types";

async function currentDay(): Promise<Day> {
  const date = todayDateString();
  const existing = await getDay(date);
  if (existing) return existing;
  const fresh: Day = {
    id: date,
    date,
    lockedAt: null,
    committedTaskIds: [],
    availableMinutes: 0,
    commitmentKeptPct: null,
    estimateAccuracyPct: null,
    notes: "",
    dismissedNudgeIds: [],
  };
  await saveDay(fresh);
  return fresh;
}

export async function generateMorningProposal() {
  const day = await currentDay();
  if (day.lockedAt) return; // locked days cannot be re-proposed

  const settings = await getSettings();
  const allTasks = await listTasks();
  const scheduledToday = allTasks.filter(
    (t) => t.scheduledAt && todayDateString(new Date(t.scheduledAt)) === day.date
  );
  const free = freeCalendarMinutesToday(settings, new Date(), scheduledToday);
  const avail = computeAvailableMinutes(free, settings.focusFactor);

  const openTasks = allTasks.filter(
    (t) => !["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"].includes(t.status)
  );

  const areaLastTouched: Record<string, string> = {};
  for (const t of allTasks) {
    if (!areaLastTouched[t.areaId] || t.lastTouchedAt > areaLastTouched[t.areaId]!) {
      areaLastTouched[t.areaId] = t.lastTouchedAt;
    }
  }

  const result = buildMorningProposal(openTasks, areaLastTouched, { availableMinutes: avail });

  await saveDay({
    ...day,
    availableMinutes: avail,
    committedTaskIds: result.proposed.map((t) => t.id),
  });

  revalidatePath("/today");
}

export async function toggleCommittedTask(taskId: string, committed: boolean) {
  const day = await currentDay();
  if (day.lockedAt) return;
  const ids = new Set(day.committedTaskIds);
  if (committed) ids.add(taskId);
  else ids.delete(taskId);
  await saveDay({ ...day, committedTaskIds: [...ids] });
  revalidatePath("/today");
}

export async function lockDay() {
  const day = await currentDay();
  if (day.lockedAt) return;
  await saveDay({ ...day, lockedAt: nowIso() });
  revalidatePath("/today");
}

export async function completeTask(taskId: string, actualMinutes?: number) {
  const task = await getTask(taskId);
  if (!task) return;
  const terminal: Record<string, string> = {
    build: "shipped",
    delegated: "accepted",
    assignment: "submitted",
    learning: "artifact_produced",
    cadence: "done",
    user_chat: "logged",
  };
  await saveTask({
    ...task,
    status: terminal[task.type] ?? "done",
    closedAt: nowIso(),
    lastTouchedAt: nowIso(),
    actualMinutes: actualMinutes ?? task.actualMinutes,
  });

  if (task.type === "cadence" && task.cadenceRuleId) {
    const rules = await listCadenceRules();
    const rule = rules.find((r) => r.id === task.cadenceRuleId);
    const week = startOfWeek();
    if (rule) {
      const count = rule.weekOf === week ? rule.currentWeekCount + 1 : 1;
      await saveCadenceRule({ ...rule, currentWeekCount: count, weekOf: week });
    }
  }

  revalidatePath("/today");
}

export async function dropCommittedTask(taskId: string, reason: string) {
  const day = await currentDay();
  const task = await getTask(taskId);
  if (task) {
    await saveTask({ ...task, droppedReason: reason, lastTouchedAt: nowIso() });
  }
  await saveDay({
    ...day,
    committedTaskIds: day.committedTaskIds.filter((id) => id !== taskId),
    notes: day.notes + `\nDropped "${task?.title ?? taskId}": ${reason}`,
  });
  revalidatePath("/today");
  revalidatePath("/reviews/weekly");
}

export async function quickAddToTriage(title: string, areaId: string) {
  const task: Task = {
    id: newId("task"),
    areaId,
    goalId: null,
    initiativeId: null,
    type: "build",
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
  revalidatePath("/today");
  revalidatePath("/triage");
}

export async function dismissNudge(nudgeId: string) {
  const day = await currentDay();
  await saveDay({ ...day, dismissedNudgeIds: [...new Set([...day.dismissedNudgeIds, nudgeId])] });
  revalidatePath("/today");
}

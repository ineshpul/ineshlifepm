"use server";

import { revalidatePath } from "next/cache";
import {
  getSettings, saveSettings, saveArea, saveAssignee, saveCadenceRule, newId, nowIso,
} from "@/lib/repo";
import type { Area, Assignee, CadenceRule, RecurringBlock, TaskSize } from "@/lib/types";

export async function updateGeneralSettings(input: {
  focusFactor: number;
  sizeMinutes: Record<TaskSize, number>;
  workDayStartMinute: number;
  workDayEndMinute: number;
}) {
  const settings = await getSettings();
  await saveSettings({ ...settings, ...input });
  revalidatePath("/settings");
}

export async function rotateCalendarToken() {
  const settings = await getSettings();
  const token = newId("cal");
  await saveSettings({ ...settings, calendarToken: token });
  revalidatePath("/settings");
  return token;
}

export async function upsertArea(input: { id?: string; name: string; colorToken: string; sortOrder: number; isCadenceOnly: boolean }) {
  const area: Area = { id: input.id ?? newId("area"), ...input };
  await saveArea(area);
  revalidatePath("/settings");
}

export async function upsertAssignee(input: { id?: string; name: string; reliability: "reliable" | "variable" }) {
  const assignee: Assignee = { id: input.id ?? newId("assignee"), name: input.name, reliability: input.reliability, active: true };
  await saveAssignee(assignee);
  revalidatePath("/settings");
}

export async function upsertCadenceRule(input: { id?: string; areaId: string; title: string; targetPerWeek: number; minPerWeek: number | null }) {
  const rule: CadenceRule = {
    id: input.id ?? newId("cadence"),
    areaId: input.areaId,
    title: input.title,
    targetPerWeek: input.targetPerWeek,
    minPerWeek: input.minPerWeek,
    currentWeekCount: 0,
    weekOf: "",
  };
  await saveCadenceRule(rule);
  revalidatePath("/settings");
  revalidatePath("/today");
}

export async function addRecurringBlock(block: Omit<RecurringBlock, "id">) {
  const settings = await getSettings();
  const newBlock: RecurringBlock = { id: newId("block"), ...block };
  await saveSettings({ ...settings, recurringBlocks: [...settings.recurringBlocks, newBlock] });
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function removeRecurringBlock(id: string) {
  const settings = await getSettings();
  await saveSettings({ ...settings, recurringBlocks: settings.recurringBlocks.filter((b) => b.id !== id) });
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export { nowIso };

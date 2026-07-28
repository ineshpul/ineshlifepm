"use server";

import { revalidatePath } from "next/cache";
import { getTask, saveTask, nowIso } from "@/lib/repo";

export async function rescheduleTask(taskId: string, scheduledAtIso: string) {
  const task = await getTask(taskId);
  if (!task) return;
  await saveTask({ ...task, scheduledAt: scheduledAtIso, lastTouchedAt: nowIso() });
  revalidatePath("/calendar");
  revalidatePath("/today");
}

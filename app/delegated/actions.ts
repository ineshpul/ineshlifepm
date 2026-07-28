"use server";

import { revalidatePath } from "next/cache";
import { getTask, saveTask, nowIso } from "@/lib/repo";

const PIPELINE = ["specced", "sent", "in_progress", "review", "accepted"];

export async function advanceDelegatedStatus(taskId: string, status: string) {
  if (!PIPELINE.includes(status)) throw new Error("Invalid status.");
  const task = await getTask(taskId);
  if (!task) return;
  await saveTask({
    ...task,
    status,
    lastTouchedAt: nowIso(),
    closedAt: status === "accepted" ? nowIso() : task.closedAt,
  });
  revalidatePath("/delegated");
  revalidatePath("/today");
}

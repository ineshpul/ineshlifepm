"use server";

import { revalidatePath } from "next/cache";
import { saveVisionItem, saveGoal, getVisionItem, newId, nowIso } from "@/lib/repo";
import type { VisionItem } from "@/lib/types";

export async function upsertVisionItem(input: {
  id?: string;
  areaId: string;
  title: string;
  body: string;
  imageUrl: string | null;
}) {
  const existing = input.id ? await getVisionItem(input.id) : null;
  const item: VisionItem = {
    id: input.id ?? newId("vision"),
    areaId: input.areaId,
    title: input.title,
    body: input.body,
    imageUrl: input.imageUrl,
    createdAt: existing?.createdAt ?? nowIso(),
    lastActivatedAt: existing?.lastActivatedAt ?? null,
    status: existing?.status ?? "dormant",
    linkedGoalIds: existing?.linkedGoalIds ?? [],
  };
  await saveVisionItem(item);
  revalidatePath("/vision");
  return item;
}

// Vision → Active only by explicit user action (§3). Creates a stub goal
// linked to this vision item and marks the vision item active.
export async function promoteVisionItemToGoal(visionItemId: string, goalTitle: string) {
  const vision = await getVisionItem(visionItemId);
  if (!vision) throw new Error("Vision item not found.");

  const goal = {
    id: newId("goal"),
    areaId: vision.areaId,
    initiativeId: null,
    title: goalTitle,
    successDefinition: "",
    targetDate: null,
    priority: 3,
    status: "not_started" as const,
    visionItemId: vision.id,
  };
  await saveGoal(goal);
  await saveVisionItem({
    ...vision,
    status: "active",
    lastActivatedAt: nowIso(),
    linkedGoalIds: [...vision.linkedGoalIds, goal.id],
  });
  revalidatePath("/vision");
  revalidatePath("/goals");
  return goal;
}

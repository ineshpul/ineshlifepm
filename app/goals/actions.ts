"use server";

import { revalidatePath } from "next/cache";
import { saveGoal, newId } from "@/lib/repo";
import type { Goal, GoalStatus } from "@/lib/types";

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
}) {
  // §5.3 CRITICAL: a goal cannot be set to `active` without a success_definition.
  if (input.status === "active" && !input.successDefinition.trim()) {
    throw new Error("A goal needs a success definition before it can go active.");
  }

  const goal: Goal = {
    id: input.id ?? newId("goal"),
    areaId: input.areaId,
    initiativeId: input.initiativeId,
    title: input.title,
    successDefinition: input.successDefinition,
    targetDate: input.targetDate,
    priority: input.priority,
    status: input.status,
    visionItemId: input.visionItemId,
  };
  await saveGoal(goal);
  revalidatePath("/goals");
  return goal;
}

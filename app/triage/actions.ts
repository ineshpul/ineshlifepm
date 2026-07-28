"use server";

import { revalidatePath } from "next/cache";
import { getTask, saveTask, deleteTask, nowIso } from "@/lib/repo";
import type { TaskSubtype } from "@/lib/types";

function validateForExit(subtype: TaskSubtype, fields: {
  definitionOfDone: string | null;
  severity: number | null;
  hypothesis: string | null;
  targetMetric: string | null;
}) {
  // §6.1: a build item cannot leave triage without its subtype's required fields.
  if (subtype === "bug" || subtype === "issue") {
    if (!fields.definitionOfDone?.trim() || !fields.severity) {
      throw new Error(
        subtype === "bug"
          ? "Bugs need repro steps and a severity before leaving triage."
          : "Issues need an observation and a severity before leaving triage."
      );
    }
  }
  if (subtype === "feature") {
    if (!fields.hypothesis?.trim() || !fields.targetMetric?.trim()) {
      throw new Error("Features need a hypothesis and a target metric before leaving triage.");
    }
  }
}

export async function assignGoalAndAdvance(taskId: string, input: {
  goalId: string | null;
  definitionOfDone: string;
  severity: number | null;
  hypothesis: string;
  targetMetric: string;
}) {
  const task = await getTask(taskId);
  if (!task) throw new Error("Task not found.");

  validateForExit(task.subtype, {
    definitionOfDone: input.definitionOfDone,
    severity: input.severity,
    hypothesis: input.hypothesis,
    targetMetric: input.targetMetric,
  });

  await saveTask({
    ...task,
    goalId: input.goalId,
    definitionOfDone: input.definitionOfDone || task.definitionOfDone,
    severity: input.severity,
    hypothesis: input.hypothesis || task.hypothesis,
    targetMetric: input.targetMetric || task.targetMetric,
    status: "specced",
    lastTouchedAt: nowIso(),
  });
  revalidatePath("/triage");
  revalidatePath("/today");
  revalidatePath("/goals");
}

export async function sendToBacklog(taskId: string, fields: {
  definitionOfDone: string;
  severity: number | null;
  hypothesis: string;
  targetMetric: string;
}) {
  const task = await getTask(taskId);
  if (!task) throw new Error("Task not found.");

  validateForExit(task.subtype, fields);

  await saveTask({
    ...task,
    definitionOfDone: fields.definitionOfDone || task.definitionOfDone,
    severity: fields.severity,
    hypothesis: fields.hypothesis || task.hypothesis,
    targetMetric: fields.targetMetric || task.targetMetric,
    status: "specced",
    lastTouchedAt: nowIso(),
  });
  revalidatePath("/triage");
  revalidatePath("/today");
}

export async function delegateFromTriage(taskId: string, assigneeId: string, definitionOfDone: string) {
  const task = await getTask(taskId);
  if (!task) throw new Error("Task not found.");
  if (!definitionOfDone.trim()) throw new Error("Delegated work needs acceptance criteria.");

  await saveTask({
    ...task,
    type: "delegated",
    assigneeId,
    definitionOfDone,
    status: "specced",
    lastTouchedAt: nowIso(),
  });
  revalidatePath("/triage");
  revalidatePath("/delegated");
  revalidatePath("/today");
}

export async function deleteFromTriage(taskId: string) {
  await deleteTask(taskId);
  revalidatePath("/triage");
  revalidatePath("/today");
}

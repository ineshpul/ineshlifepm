import { DEFAULT_SIZE_MINUTES } from "./constants";
import type { Task, TaskSize } from "./types";

export function effectiveEstimateMinutes(
  task: Task,
  sizeMinutes: Record<TaskSize, number> = DEFAULT_SIZE_MINUTES
): number {
  if (task.estimateMinutes != null && task.estimateMinutes > 0) return task.estimateMinutes;
  if (task.size) return sizeMinutes[task.size];
  return sizeMinutes.M;
}

export function withEffectiveEstimates(
  tasks: Task[],
  sizeMinutes: Record<TaskSize, number> = DEFAULT_SIZE_MINUTES
): Task[] {
  return tasks.map((t) => ({
    ...t,
    estimateMinutes: effectiveEstimateMinutes(t, sizeMinutes),
  }));
}

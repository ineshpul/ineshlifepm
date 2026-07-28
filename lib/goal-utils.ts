import type { Goal, Initiative, KnowledgeEntry } from "./types";
import { DEFAULT_WORKSPACE_ID } from "./types";

export function workspaceId(item: { workspaceId?: string } | undefined): string {
  return item?.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

export function stampWorkspace<T extends { workspaceId?: string }>(
  item: T,
  ws: string = DEFAULT_WORKSPACE_ID
): T {
  return { ...item, workspaceId: item.workspaceId ?? ws };
}

export function normalizeGoal(g: Goal): Goal {
  return {
    ...g,
    currentState: g.currentState ?? "",
    actionItems: g.actionItems ?? "",
    solution: g.solution ?? "",
    isQuantifiable: g.isQuantifiable ?? false,
    trackUnit: g.trackUnit ?? "",
    trackTargetPerDay: g.trackTargetPerDay ?? null,
    workspaceId: g.workspaceId ?? DEFAULT_WORKSPACE_ID,
  };
}

export function normalizeInitiative(i: Initiative): Initiative {
  return {
    ...i,
    sortOrder: i.sortOrder ?? 0,
    workspaceId: i.workspaceId ?? DEFAULT_WORKSPACE_ID,
  };
}

export function normalizeKnowledgeEntry(e: KnowledgeEntry): KnowledgeEntry {
  return {
    ...e,
    areaId: e.areaId ?? null,
    initiativeId: e.initiativeId ?? null,
    fileUrl: e.fileUrl ?? null,
    workspaceId: e.workspaceId ?? DEFAULT_WORKSPACE_ID,
  };
}

export const GOAL_STATUS_LABELS: Record<Goal["status"], string> = {
  not_started: "Not started",
  active: "In progress",
  done: "Resolved",
  parked: "Parked",
};

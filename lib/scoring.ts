import type { Task, TaskSize } from "./types";
import { daysSince } from "./dates";
import { DEFAULT_SIZE_MINUTES } from "./constants";

function taskMinutes(
  task: Task,
  sizeMinutes: Record<TaskSize, number> = DEFAULT_SIZE_MINUTES
): number {
  if (task.estimateMinutes != null && task.estimateMinutes > 0) return task.estimateMinutes;
  if (task.size) return sizeMinutes[task.size];
  return sizeMinutes.M;
}

// §7.1 Priority score — orders the backlog, does not decide the day.
export function priorityScore(task: Task, now = new Date()): number {
  const priority = task.priority ?? 3;
  const base = priority * 2;

  let deadlinePressure = 0;
  if (task.dueAt) {
    const daysOut = (new Date(task.dueAt).getTime() - now.getTime()) / 86_400_000;
    if (daysOut <= 0) deadlinePressure = 5;
    else if (daysOut >= 14) deadlinePressure = 0;
    else deadlinePressure = 5 * (1 - daysOut / 14);
  }

  const staleDays = daysSince(task.lastTouchedAt, now);
  const staleness = Math.min(5, Math.floor(staleDays / 7));

  let severityBoost = 0;
  if (
    (task.type === "build" && (task.subtype === "bug" || task.subtype === "issue")) &&
    task.severity
  ) {
    severityBoost = 5 - task.severity;
  }

  return base + deadlinePressure + staleness + severityBoost;
}

export function sortByPriorityScore(tasks: Task[], now = new Date()): Task[] {
  return [...tasks].sort((a, b) => priorityScore(b, now) - priorityScore(a, now));
}

// §7.2 Capacity, time-based
export function availableMinutes(freeCalendarMinutes: number, focusFactor: number): number {
  return Math.round(freeCalendarMinutes * focusFactor);
}

// §7.3 Mix constraints — build the morning proposal.
export interface ProposalOptions {
  availableMinutes: number;
  maxPerArea?: number; // default 2
  staleThresholdDays?: number; // default 14 (2x the +1/7day cap window)
  untouchedAreaDays?: number; // default 3
  sizeMinutes?: Record<TaskSize, number>;
}

export interface ProposalResult {
  proposed: Task[];
  totalMinutes: number;
  delegatedChecks: Task[]; // shown separately, outside capacity
}

export function buildMorningProposal(
  candidateTasks: Task[],
  areaLastTouched: Record<string, string>, // areaId -> most recent lastTouchedAt across all tasks
  opts: ProposalOptions,
  now = new Date()
): ProposalResult {
  const maxPerArea = opts.maxPerArea ?? 2;
  const staleThresholdDays = opts.staleThresholdDays ?? 14;
  const untouchedAreaDays = opts.untouchedAreaDays ?? 3;
  const sizeMinutes = opts.sizeMinutes ?? DEFAULT_SIZE_MINUTES;

  const delegatedChecks = candidateTasks.filter((t) => t.type === "delegated");
  const capacityCandidates = candidateTasks.filter((t) => t.type !== "delegated");

  // Cadence items due this week offered before optional work: sort cadence first, then by score.
  const ranked = sortByPriorityScore(capacityCandidates, now).sort((a, b) => {
    if (a.type === "cadence" && b.type !== "cadence") return -1;
    if (b.type === "cadence" && a.type !== "cadence") return 1;
    return 0;
  });

  const proposed: Task[] = [];
  const perAreaCount: Record<string, number> = {};
  let totalMinutes = 0;
  const budget = opts.availableMinutes;

  const fits = (t: Task) => {
    const mins = taskMinutes(t, sizeMinutes);
    if (totalMinutes + mins > budget) return false;
    const count = perAreaCount[t.areaId] ?? 0;
    if (count >= maxPerArea) return false;
    return true;
  };

  const take = (t: Task) => {
    proposed.push(t);
    totalMinutes += taskMinutes(t, sizeMinutes);
    perAreaCount[t.areaId] = (perAreaCount[t.areaId] ?? 0) + 1;
  };

  // Fill by score/cadence order first.
  for (const t of ranked) {
    if (fits(t)) take(t);
  }

  // Ensure at least 1 stale task, if one exists and isn't already included.
  const hasStale = proposed.some((t) => daysSince(t.lastTouchedAt, now) >= staleThresholdDays);
  if (!hasStale) {
    const staleCandidate = ranked.find(
      (t) => daysSince(t.lastTouchedAt, now) >= staleThresholdDays && !proposed.includes(t) && fits(t)
    );
    if (staleCandidate) take(staleCandidate);
  }

  // Ensure at least 1 task from an area untouched for 3+ days.
  const untouchedAreas = Object.entries(areaLastTouched)
    .filter(([, iso]) => daysSince(iso, now) >= untouchedAreaDays)
    .map(([areaId]) => areaId);
  const hasUntouchedAreaTask = proposed.some((t) => untouchedAreas.includes(t.areaId));
  if (!hasUntouchedAreaTask && untouchedAreas.length) {
    const candidate = ranked.find(
      (t) => untouchedAreas.includes(t.areaId) && !proposed.includes(t) && fits(t)
    );
    if (candidate) take(candidate);
  }

  return { proposed, totalMinutes, delegatedChecks };
}

// §8.1 Daily scoring
export function commitmentKeptPct(closedCommitted: number, totalCommitted: number): number | null {
  if (totalCommitted === 0) return null;
  return closedCommitted / totalCommitted;
}

export function estimateAccuracyPct(actualMinutes: number, estimateMinutes: number): number | null {
  if (!estimateMinutes) return null;
  return 1 - Math.abs(actualMinutes - estimateMinutes) / estimateMinutes;
}

export function ladderRate(tasks: Task[]): number | null {
  if (!tasks.length) return null;
  const attached = tasks.filter((t) => t.goalId).length;
  return attached / tasks.length;
}

export function spread(tasks: Task[]): number {
  return new Set(tasks.map((t) => t.areaId)).size;
}

// §8.2 Real capacity — rolling 14-day average
export function realCapacity(closedCommittedPerDay: number[]): number {
  if (!closedCommittedPerDay.length) return 0;
  const sum = closedCommittedPerDay.reduce((a, b) => a + b, 0);
  return sum / closedCommittedPerDay.length;
}

export function realMinutes(actualMinutesPerDay: number[]): number {
  if (!actualMinutesPerDay.length) return 0;
  const sum = actualMinutesPerDay.reduce((a, b) => a + b, 0);
  return sum / actualMinutesPerDay.length;
}

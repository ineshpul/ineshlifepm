import type { Area, Day, Metric, MetricReading, Task, TaskSize } from "./types";
import { effectiveEstimateMinutes } from "./task-estimate";
import { metricTargetLine, metricValueDisplay } from "./metric-display";
import { areaHex } from "./area-styles";

export type TodayTicker = {
  label: string;
  value: string;
  unitSuffix: string;
  sub: string;
  color: string;
  sparkline?: MetricReading[];
};

export function primaryMetricForFocus(
  metrics: Metric[],
  focusAreaId: string | "all"
): Metric | null {
  if (focusAreaId === "all") {
    return metrics.find((m) => m.isNorthStar) ?? metrics[0] ?? null;
  }
  const inArea = metrics.filter((m) => m.areaId === focusAreaId);
  return inArea.find((m) => m.isNorthStar) ?? inArea[0] ?? null;
}

/** Card 1 — calibration framing for current focus. */
export function calibrationTicker(
  calibration14d: number | null,
  focusArea: Area | null,
  doneToday: number,
  totalToday: number
): TodayTicker {
  const pct = calibration14d === null ? null : Math.round(calibration14d * 100);
  const scope = focusArea ? focusArea.name : "All areas";
  return {
    label: `How often you finish what you plan · last 14 days · ${scope}`,
    value: pct === null ? "—" : String(pct),
    unitSuffix: pct === null ? "" : "%",
    sub:
      totalToday > 0
        ? `${doneToday} of ${totalToday} done today in this focus.`
        : `Nothing committed in this focus yet today.`,
    color: "#2fae5b",
  };
}

/** Card 2 — north star / main number for focus (mockup middle tile). */
export function mainMetricTicker(
  metric: Metric | null,
  area: Area | undefined,
  readings: MetricReading[]
): TodayTicker | null {
  if (!metric) return null;
  const hex = area ? areaHex(area.colorToken) : "#6d4aff";
  const areaName = area?.name ?? "Area";
  return {
    label: metric.isNorthStar ? `North star · ${metric.name}` : `${areaName} · ${metric.name}`,
    value: metricValueDisplay(metric.currentValue),
    unitSuffix: metric.unit ? ` ${metric.unit}` : "",
    sub: metricTargetLine(metric),
    color: hex,
    sparkline: readings,
  };
}

/** Card 3 — capacity / plan pressure for focus. */
export function capacityTicker(
  focusArea: Area | null,
  plannedMinutes: number,
  usualMinutes: number,
  realCapacityTasks: number,
  areaOpenCount: number
): TodayTicker {
  const scope = focusArea ? focusArea.name : "All areas";
  const over = plannedMinutes > usualMinutes && usualMinutes > 0;
  return {
    label: `What you usually get done · ${scope}`,
    value: String(usualMinutes),
    unitSuffix: " min",
    sub: over
      ? `You planned ${plannedMinutes} min in this focus today — ${plannedMinutes - usualMinutes} above your recent pace. Not a wall, just the number.`
      : areaOpenCount > 0
        ? `${areaOpenCount} open task${areaOpenCount === 1 ? "" : "s"} in this focus. Today's plan fits your recent pace.`
        : `≈ ${realCapacityTasks.toFixed(1)} tasks/day across everything.`,
    color: "#e08a2b",
  };
}

export function openTasksInFocus(tasks: Task[], focusAreaId: string | "all"): number {
  const terminal = ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"];
  return tasks.filter(
    (t) => !terminal.includes(t.status) && (focusAreaId === "all" || t.areaId === focusAreaId)
  ).length;
}

export function usualMinutesForFocus(
  focusAreaId: string | "all",
  recentDays: Day[],
  tasks: Task[],
  sizeMinutes: Record<TaskSize, number>,
  globalRealCapacity: number
): number {
  if (focusAreaId === "all") {
    return Math.round(globalRealCapacity * (sizeMinutes.M || 90));
  }
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const last14 = [...recentDays]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 14);
  const daily = last14
    .map((d) =>
      d.committedTaskIds
        .filter((id) => taskById.get(id)?.areaId === focusAreaId)
        .reduce((s, id) => {
          const t = taskById.get(id);
          return t ? s + effectiveEstimateMinutes(t, sizeMinutes) : s;
        }, 0)
    )
    .filter((m) => m > 0);
  if (daily.length === 0) return Math.round(sizeMinutes.M * 0.75);
  return Math.round(daily.reduce((a, b) => a + b, 0) / daily.length);
}

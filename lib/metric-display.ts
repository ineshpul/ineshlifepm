import type { Metric } from "./types";

export function metricValueDisplay(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return String(value);
}

export function metricTargetLine(metric: Metric): string {
  const t = metricValueDisplay(metric.targetValue);
  if (t === "—") return "Set a target in Metrics";
  const u = metric.unit?.trim() ? ` ${metric.unit}` : "";
  return `Target ${t}${u}`;
}

export function hasMetricNumbers(metric: Metric): boolean {
  return metric.currentValue !== null && metric.currentValue !== undefined;
}

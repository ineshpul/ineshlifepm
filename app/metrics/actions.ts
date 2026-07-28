"use server";

import { revalidatePath } from "next/cache";
import { addMetricReading, saveMetric, getMetric, deleteMetric, newId, nowIso } from "@/lib/repo";
import type { Metric } from "@/lib/types";

export async function recordReading(metricId: string, value: number) {
  await addMetricReading(metricId, value);
  revalidatePath("/metrics");
  revalidatePath("/today");
}

function parseOptionalNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function upsertMetric(input: {
  id?: string;
  areaId: string;
  name: string;
  isNorthStar: boolean;
  parentMetricId: string | null;
  targetValue: string | number | null;
  currentValue?: string | number | null;
  unit: string;
}) {
  const existing = input.id ? await getMetric(input.id) : null;
  const metric: Metric = {
    id: input.id ?? newId("metric"),
    areaId: input.areaId,
    name: input.name,
    isNorthStar: input.isNorthStar,
    parentMetricId: input.parentMetricId,
    currentValue:
      input.currentValue !== undefined
        ? parseOptionalNumber(input.currentValue)
        : (existing?.currentValue ?? null),
    targetValue: parseOptionalNumber(input.targetValue),
    unit: input.unit.trim(),
    updatedAt: nowIso(),
  };
  await saveMetric(metric);
  revalidatePath("/metrics");
  revalidatePath("/today");
  return metric;
}

export async function updateMetricDefinition(input: {
  id: string;
  name: string;
  isNorthStar: boolean;
  parentMetricId: string | null;
  targetValue: string | number | null;
  currentValue: string | number | null;
  unit: string;
}) {
  const existing = await getMetric(input.id);
  if (!existing) throw new Error("Metric not found.");
  await saveMetric({
    ...existing,
    name: input.name.trim(),
    isNorthStar: input.isNorthStar,
    parentMetricId: input.isNorthStar ? null : input.parentMetricId,
    targetValue: parseOptionalNumber(input.targetValue),
    currentValue: parseOptionalNumber(input.currentValue),
    unit: input.unit.trim(),
    updatedAt: nowIso(),
  });
  revalidatePath("/metrics");
  revalidatePath("/today");
}

export async function removeMetric(metricId: string) {
  await deleteMetric(metricId);
  revalidatePath("/metrics");
  revalidatePath("/today");
}

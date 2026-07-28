"use server";

import { revalidatePath } from "next/cache";
import { addMetricReading, saveMetric, newId, nowIso } from "@/lib/repo";
import type { Metric } from "@/lib/types";

export async function recordReading(metricId: string, value: number) {
  await addMetricReading(metricId, value);
  revalidatePath("/metrics");
  revalidatePath("/today");
}

export async function upsertMetric(input: {
  id?: string;
  areaId: string;
  name: string;
  isNorthStar: boolean;
  parentMetricId: string | null;
  targetValue: number;
  unit: string;
}) {
  const metric: Metric = {
    id: input.id ?? newId("metric"),
    areaId: input.areaId,
    name: input.name,
    isNorthStar: input.isNorthStar,
    parentMetricId: input.parentMetricId,
    currentValue: 0,
    targetValue: input.targetValue,
    unit: input.unit,
    updatedAt: nowIso(),
  };
  await saveMetric(metric);
  revalidatePath("/metrics");
  return metric;
}

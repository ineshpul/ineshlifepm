"use client";

import { useState, useTransition } from "react";
import { AreaTag } from "@/components/AreaTag";
import { daysSince } from "@/lib/dates";
import type { Area, Metric, MetricReading } from "@/lib/types";
import { recordReading, upsertMetric } from "./actions";
import { Sparkline } from "./Sparkline";

export function MetricsClient({
  areas, metrics, readingsByMetric,
}: {
  areas: Area[];
  metrics: Metric[];
  readingsByMetric: Record<string, MetricReading[]>;
}) {
  const [creatingArea, setCreatingArea] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const metricsByArea = new Map<string, Metric[]>();
  for (const m of metrics) {
    if (!metricsByArea.has(m.areaId)) metricsByArea.set(m.areaId, []);
    metricsByArea.get(m.areaId)!.push(m);
  }

  function tree(areaMetrics: Metric[]) {
    const northStars = areaMetrics.filter((m) => !m.parentMetricId);
    const children = (parentId: string) => areaMetrics.filter((m) => m.parentMetricId === parentId);
    return { northStars, children };
  }

  return (
    <div className="nesh-page">
      <p className="mb-6 text-sm text-[#6b6f7d]">North star plus input drivers, per area. Manual entry.</p>
      <div className="space-y-8">
        {areas.map((area) => {
          const areaMetrics = metricsByArea.get(area.id) ?? [];
          const { northStars, children } = tree(areaMetrics);
          return (
            <section key={area.id}>
              <div className="mb-3 flex items-center justify-between">
                <AreaTag name={area.name} colorToken={area.colorToken} />
                <button className="text-xs muted hover:underline" onClick={() => setCreatingArea(creatingArea === area.id ? null : area.id)}>
                  + New metric
                </button>
              </div>

              {creatingArea === area.id && (
                <NewMetricForm areaId={area.id} metrics={areaMetrics} onDone={() => setCreatingArea(null)} pending={isPending} startTransition={startTransition} />
              )}

              {northStars.length === 0 ? (
                <p className="muted text-sm">No metrics yet.</p>
              ) : (
                <div className="space-y-3">
                  {northStars.map((m) => (
                    <div key={m.id} className="card p-4">
                      <MetricRow metric={m} readings={readingsByMetric[m.id] ?? []} isNorthStar startTransition={startTransition} />
                      {children(m.id).length > 0 && (
                        <div className="ml-4 mt-3 space-y-3 border-l hairline pl-4">
                          {children(m.id).map((c) => (
                            <MetricRow key={c.id} metric={c} readings={readingsByMetric[c.id] ?? []} startTransition={startTransition} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MetricRow({
  metric, readings, isNorthStar, startTransition,
}: {
  metric: Metric;
  readings: MetricReading[];
  isNorthStar?: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [value, setValue] = useState("");
  const stale = daysSince(metric.updatedAt) >= 14;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`text-sm ${isNorthStar ? "font-semibold" : ""}`}>{metric.name}</span>
          {isNorthStar && <span className="rounded-full border hairline px-1.5 py-0 text-[10px] muted">north star</span>}
          {stale && <span className="text-[10px] text-amber-600 dark:text-amber-400">stale</span>}
        </div>
        <div className="mt-1 text-lg font-medium">
          {metric.currentValue}
          <span className="text-xs muted"> / {metric.targetValue} {metric.unit}</span>
        </div>
      </div>
      <Sparkline readings={readings} target={metric.targetValue} />
      <div className="flex shrink-0 items-center gap-1">
        <input
          className="w-16 rounded-md border hairline bg-transparent px-2 py-1 text-xs"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          className="rounded-md border hairline px-2 py-1 text-xs"
          onClick={() => {
            const v = Number(value);
            if (!Number.isFinite(v)) return;
            startTransition(() => recordReading(metric.id, v));
            setValue("");
          }}
        >
          Log
        </button>
      </div>
    </div>
  );
}

function NewMetricForm({
  areaId, metrics, onDone, pending, startTransition,
}: {
  areaId: string;
  metrics: Metric[];
  onDone: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [isNorthStar, setIsNorthStar] = useState(false);
  const [parentMetricId, setParentMetricId] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");

  return (
    <div className="card mb-3 space-y-2 p-4">
      <input className="w-full rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Metric name" value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={isNorthStar} onChange={(e) => setIsNorthStar(e.target.checked)} /> North star
        </label>
        {!isNorthStar && metrics.length > 0 && (
          <select className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" value={parentMetricId} onChange={(e) => setParentMetricId(e.target.value)}>
            <option value="">No parent (flat)</option>
            {metrics.filter((m) => !m.parentMetricId).map((m) => <option key={m.id} value={m.id}>Driver of: {m.name}</option>)}
          </select>
        )}
        <input className="w-24 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Target" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
        <input className="w-20 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm" placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-[var(--bg)]"
          disabled={pending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              await upsertMetric({
                areaId, name: name.trim(), isNorthStar,
                parentMetricId: isNorthStar ? null : parentMetricId || null,
                targetValue: Number(targetValue) || 0, unit,
              });
              onDone();
            })
          }
        >
          Save
        </button>
        <button className="text-xs muted" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTag } from "@/components/AreaTag";
import { btnAccent, btnDangerGhost, btnGhost, btnPrimary, btnSecondary, fieldInput, fieldSelect } from "@/components/nesh/nesh-ui";
import { daysSince } from "@/lib/dates";
import { metricTargetLine, metricValueDisplay } from "@/lib/metric-display";
import type { Area, Metric, MetricReading } from "@/lib/types";
import { recordReading, removeMetric, updateMetricDefinition, upsertMetric } from "./actions";
import { Sparkline } from "./Sparkline";

export function MetricsClient({
  areas, metrics, readingsByMetric,
}: {
  areas: Area[];
  metrics: Metric[];
  readingsByMetric: Record<string, MetricReading[]>;
}) {
  const [creatingArea, setCreatingArea] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
      <p className="mb-2 text-sm text-[#6b6f7d]">
        You define every number here — name, current value, target, and unit. Nothing is pre-filled.
      </p>
      <p className="mb-6 text-[13px] text-[#9a9aa8]">
        Mark one metric per area as <strong className="font-semibold text-[#6b6f7d]">north star</strong> to show it on Today when that area is focused.
      </p>
      <div className="space-y-8">
        {areas.map((area) => {
          const areaMetrics = metricsByArea.get(area.id) ?? [];
          const { northStars, children } = tree(areaMetrics);
          return (
            <section key={area.id}>
              <div className="mb-3 flex items-center justify-between">
                <AreaTag name={area.name} colorToken={area.colorToken} />
                <button
                  type="button"
                  className={btnGhost + " text-xs"}
                  onClick={() => setCreatingArea(creatingArea === area.id ? null : area.id)}
                >
                  + New metric
                </button>
              </div>

              {creatingArea === area.id && (
                <NewMetricForm
                  areaId={area.id}
                  metrics={areaMetrics}
                  onDone={() => {
                    setCreatingArea(null);
                    router.refresh();
                  }}
                  pending={isPending}
                  startTransition={startTransition}
                />
              )}

              {northStars.length === 0 ? (
                <p className="text-sm text-[#9a9aa8]">No metrics yet — add one to track this area.</p>
              ) : (
                <div className="space-y-3">
                  {northStars.map((m) => (
                    <div key={m.id} className="card p-4">
                      {editingId === m.id ? (
                        <EditMetricForm
                          metric={m}
                          areaMetrics={areaMetrics}
                          onDone={() => {
                            setEditingId(null);
                            router.refresh();
                          }}
                          pending={isPending}
                          startTransition={startTransition}
                        />
                      ) : (
                        <MetricRow
                          metric={m}
                          readings={readingsByMetric[m.id] ?? []}
                          isNorthStar
                          onEdit={() => setEditingId(m.id)}
                          startTransition={startTransition}
                          onDeleted={() => router.refresh()}
                        />
                      )}
                      {children(m.id).length > 0 && (
                        <div className="ml-4 mt-3 space-y-3 border-l border-[#ececf1] pl-4">
                          {children(m.id).map((c) =>
                            editingId === c.id ? (
                              <EditMetricForm
                                key={c.id}
                                metric={c}
                                areaMetrics={areaMetrics}
                                onDone={() => {
                                  setEditingId(null);
                                  router.refresh();
                                }}
                                pending={isPending}
                                startTransition={startTransition}
                              />
                            ) : (
                              <MetricRow
                                key={c.id}
                                metric={c}
                                readings={readingsByMetric[c.id] ?? []}
                                onEdit={() => setEditingId(c.id)}
                                startTransition={startTransition}
                                onDeleted={() => router.refresh()}
                              />
                            )
                          )}
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
  metric,
  readings,
  isNorthStar,
  onEdit,
  startTransition,
  onDeleted,
}: {
  metric: Metric;
  readings: MetricReading[];
  isNorthStar?: boolean;
  onEdit: () => void;
  startTransition: (fn: () => void) => void;
  onDeleted: () => void;
}) {
  const [logValue, setLogValue] = useState("");
  const stale = metric.updatedAt ? daysSince(metric.updatedAt) >= 14 : false;
  const target = metric.targetValue;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-sm ${isNorthStar ? "font-semibold" : ""}`}>{metric.name}</span>
          {isNorthStar && (
            <span className="rounded-full border border-[#ececf1] px-1.5 py-0 text-[10px] text-[#9a9aa8]">north star</span>
          )}
          {stale && <span className="text-[10px] text-amber-600">stale</span>}
        </div>
        <div className="mt-1 text-lg font-medium text-[#17181f]">
          {metricValueDisplay(metric.currentValue)}
          <span className="text-sm font-normal text-[#9a9aa8]"> · {metricTargetLine(metric)}</span>
        </div>
      </div>
      <Sparkline readings={readings} target={target ?? undefined} />
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <input
          className={`${fieldInput} !w-20 !py-1 text-xs`}
          placeholder="Log…"
          value={logValue}
          onChange={(e) => setLogValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && logValue.trim()) {
              const v = Number(logValue);
              if (Number.isFinite(v)) {
                startTransition(async () => {
                  await recordReading(metric.id, v);
                  setLogValue("");
                });
              }
            }
          }}
        />
        <button
          type="button"
          className={btnSecondary + " !px-2 !py-1 text-xs"}
          onClick={() => {
            const v = Number(logValue);
            if (!Number.isFinite(v)) return;
            startTransition(async () => {
              await recordReading(metric.id, v);
              setLogValue("");
            });
          }}
        >
          Log
        </button>
        <button type="button" className={btnGhost + " text-xs"} onClick={onEdit}>
          Edit
        </button>
        <button
          type="button"
          className={btnDangerGhost + " text-xs"}
          onClick={() => {
            if (confirm(`Delete “${metric.name}”?`)) {
              startTransition(async () => {
                await removeMetric(metric.id);
                onDeleted();
              });
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function EditMetricForm({
  metric,
  areaMetrics,
  onDone,
  pending,
  startTransition,
}: {
  metric: Metric;
  areaMetrics: Metric[];
  onDone: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [name, setName] = useState(metric.name);
  const [isNorthStar, setIsNorthStar] = useState(metric.isNorthStar);
  const [parentMetricId, setParentMetricId] = useState(metric.parentMetricId ?? "");
  const [currentValue, setCurrentValue] = useState(
    metric.currentValue === null ? "" : String(metric.currentValue)
  );
  const [targetValue, setTargetValue] = useState(
    metric.targetValue === null ? "" : String(metric.targetValue)
  );
  const [unit, setUnit] = useState(metric.unit);

  return (
    <div className="space-y-2">
      <input className={fieldInput} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={isNorthStar} onChange={(e) => setIsNorthStar(e.target.checked)} />
          North star
        </label>
        {!isNorthStar && areaMetrics.length > 0 && (
          <select
            className={fieldSelect}
            value={parentMetricId}
            onChange={(e) => setParentMetricId(e.target.value)}
          >
            <option value="">No parent</option>
            {areaMetrics
              .filter((m) => !m.parentMetricId && m.id !== metric.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  Driver of: {m.name}
                </option>
              ))}
          </select>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className={fieldInput}
          placeholder="Current value"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
        />
        <input
          className={fieldInput}
          placeholder="Target (optional)"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
        />
        <input className={fieldInput} placeholder="Unit (e.g. %, k)" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={btnPrimary + " !px-3 !py-1.5 text-xs"}
          disabled={pending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              await updateMetricDefinition({
                id: metric.id,
                name: name.trim(),
                isNorthStar,
                parentMetricId: isNorthStar ? null : parentMetricId || null,
                currentValue,
                targetValue,
                unit,
              });
              onDone();
            })
          }
        >
          Save
        </button>
        <button type="button" className={btnGhost + " text-xs"} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function NewMetricForm({
  areaId,
  metrics,
  onDone,
  pending,
  startTransition,
}: {
  areaId: string;
  metrics: Metric[];
  onDone: () => void;
  pending: boolean;
  startTransition: (fn: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [isNorthStar, setIsNorthStar] = useState(metrics.length === 0);
  const [parentMetricId, setParentMetricId] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");

  return (
    <div className="card mb-3 space-y-2 p-4">
      <input
        className={fieldInput}
        placeholder="Metric name (e.g. Subscribers, D7 retention)"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={isNorthStar} onChange={(e) => setIsNorthStar(e.target.checked)} />
          North star for this area
        </label>
        {!isNorthStar && metrics.length > 0 && (
          <select
            className={fieldSelect}
            value={parentMetricId}
            onChange={(e) => setParentMetricId(e.target.value)}
          >
            <option value="">No parent (flat)</option>
            {metrics.filter((m) => !m.parentMetricId).map((m) => (
              <option key={m.id} value={m.id}>
                Driver of: {m.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          className={fieldInput}
          placeholder="Current (optional)"
          value={currentValue}
          onChange={(e) => setCurrentValue(e.target.value)}
        />
        <input
          className={fieldInput}
          placeholder="Target (optional)"
          value={targetValue}
          onChange={(e) => setTargetValue(e.target.value)}
        />
        <input className={fieldInput} placeholder="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className={btnAccent + " !px-3 !py-1.5 text-xs"}
          disabled={pending || !name.trim()}
          onClick={() =>
            startTransition(async () => {
              await upsertMetric({
                areaId,
                name: name.trim(),
                isNorthStar,
                parentMetricId: isNorthStar ? null : parentMetricId || null,
                currentValue,
                targetValue,
                unit,
              });
              onDone();
            })
          }
        >
          Save metric
        </button>
        <button type="button" className={btnGhost + " text-xs"} onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

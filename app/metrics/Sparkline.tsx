"use client";

import type { MetricReading } from "@/lib/types";

export function Sparkline({ readings, target }: { readings: MetricReading[]; target?: number | null }) {
  const targetNum = target ?? undefined;
  if (readings.length < 2) {
    return <div className="h-8 text-xs text-[#9a9aa8]">Not enough readings yet.</div>;
  }
  const values = readings.map((r) => r.value);
  const min = targetNum !== undefined ? Math.min(...values, targetNum) : Math.min(...values);
  const max = targetNum !== undefined ? Math.max(...values, targetNum) : Math.max(...values);
  const range = max - min || 1;
  const w = 160;
  const h = 32;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const targetY = targetNum !== undefined ? h - ((targetNum - min) / range) * h : null;

  return (
    <svg width={w} height={h} className="overflow-visible">
      {targetY !== null ? (
        <line x1={0} y1={targetY} x2={w} y2={targetY} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="2,2" />
      ) : null}
      <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  );
}

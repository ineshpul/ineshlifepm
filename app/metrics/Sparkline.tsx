"use client";

import type { MetricReading } from "@/lib/types";

export function Sparkline({ readings, target }: { readings: MetricReading[]; target: number }) {
  if (readings.length < 2) {
    return <div className="h-8 text-xs muted">Not enough readings yet.</div>;
  }
  const values = readings.map((r) => r.value);
  const min = Math.min(...values, target);
  const max = Math.max(...values, target);
  const range = max - min || 1;
  const w = 160;
  const h = 32;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const targetY = h - ((target - min) / range) * h;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <line x1={0} y1={targetY} x2={w} y2={targetY} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="2,2" />
      <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
    </svg>
  );
}

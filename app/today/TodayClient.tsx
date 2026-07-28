"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AreaTag } from "@/components/AreaTag";
import { useAreaFocus } from "@/components/nesh/AreaFocusProvider";
import { areaHex } from "@/lib/area-styles";
import { DEFAULT_SIZE_MINUTES } from "@/lib/constants";
import type {
  Area,
  Assignee,
  CadenceRule,
  Day,
  Metric,
  MetricReading,
  Nudge,
  Task,
} from "@/lib/types";
import {
  generateMorningProposal,
  lockDay,
  completeTask,
  dropCommittedTask,
  quickAddToTriage,
  dismissNudge,
} from "./actions";

function isTerminal(status: string) {
  return ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"].includes(status);
}

function taskMinutes(t: Task, sizeMinutes: Record<"S" | "M" | "L", number>): number {
  if (t.estimateMinutes) return t.estimateMinutes;
  if (t.size) return sizeMinutes[t.size];
  return 0;
}

function MiniSparkline({ readings, color }: { readings: MetricReading[]; color: string }) {
  if (readings.length < 2) return <div className="h-7" />;
  const values = readings.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 220;
  const h = 28;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={28} preserveAspectRatio="none" className="mt-1">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CadenceRow({ rule, area }: { rule: CadenceRule; area?: Area }) {
  const token = area?.colorToken ?? "emerald";
  const hex = areaHex(token);
  const pct = rule.targetPerWeek > 0 ? Math.min(1, rule.currentWeekCount / rule.targetPerWeek) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-2 w-2 rounded-[3px]" style={{ background: hex }} />
        <span className="text-[13px] font-semibold text-[#2a2a33]">{rule.title}</span>
        <span className="ml-auto text-[12px] font-semibold text-[#9a9aa8]">
          {rule.currentWeekCount}/{rule.targetPerWeek}
          {rule.minPerWeek ? ` (range ${rule.minPerWeek}–${rule.targetPerWeek})` : ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-[#f2f2f6]">
        <div className="h-full rounded" style={{ width: `${pct * 100}%`, background: hex }} />
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function TodayClient({
  date,
  day,
  areas,
  assignees,
  committedTasks,
  delegatedChecks,
  triageCount,
  cadenceRules,
  calibration14d,
  realCapacity,
  northStar,
  northStarReadings,
  nudges,
  sizeMinutes,
}: {
  date: string;
  day: Day | null;
  areas: Area[];
  assignees: Assignee[];
  committedTasks: Task[];
  delegatedChecks: Task[];
  triageCount: number;
  cadenceRules: CadenceRule[];
  calibration14d: number | null;
  realCapacity: number;
  northStar: Metric | null;
  northStarReadings: MetricReading[];
  nudges: Nudge[];
  sizeMinutes: Record<"S" | "M" | "L", number>;
}) {
  const [isPending, startTransition] = useTransition();
  const [proposalNote, setProposalNote] = useState<string | null>(null);
  const router = useRouter();
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddArea, setQuickAddArea] = useState(areas[0]?.id ?? "");
  const { focusAreaId, isAllAreas } = useAreaFocus();

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));

  const matchesFocus = (areaId: string) => isAllAreas || focusAreaId === areaId;
  const focusArea = isAllAreas ? null : areaById.get(focusAreaId);

  const filteredCommitted = committedTasks.filter((t) => matchesFocus(t.areaId));
  const filteredDelegated = delegatedChecks.filter((t) => matchesFocus(t.areaId));
  const filteredCadence = cadenceRules.filter((r) => matchesFocus(r.areaId));

  const locked = Boolean(day?.lockedAt);
  const total = filteredCommitted.length;
  const doneToday = filteredCommitted.filter((t) => isTerminal(t.status)).length;

  const plannedMinutes = filteredCommitted.reduce((s, t) => s + taskMinutes(t, sizeMinutes), 0);
  const usualMinutes = Math.round(realCapacity * (sizeMinutes.M || 90));
  const overPlan = plannedMinutes > usualMinutes && usualMinutes > 0;

  const northStarArea = northStar ? areaById.get(northStar.areaId) : undefined;
  const northStarHex = northStarArea ? areaHex(northStarArea.colorToken) : "#e5449b";

  const calPct = calibration14d === null ? null : Math.round(calibration14d * 100);
  const calGood = calPct !== null && calPct >= 70;

  return (
    <div className="nesh-page">
      {proposalNote && (
        <div className="mb-4 rounded-xl border border-[#ececf1] bg-white px-4 py-2.5 text-sm text-[#3d3d47]">
          {proposalNote}
        </div>
      )}
      {nudges.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-3">
          {nudges.map((n) => (
            <div
              key={n.id}
              className="flex items-center gap-2 rounded-full border border-[#ececf1] bg-white px-4 py-2 text-[13px] font-medium text-[#3d3d47] shadow-sm"
            >
              <span className="h-2 w-2 rounded-full bg-[#6d4aff]" />
              {n.message}
              <button
                type="button"
                className="ml-2 text-[#b7b7c4] hover:text-[#6d4aff]"
                onClick={() => startTransition(() => dismissNudge(n.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Metric row */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr_1.15fr]">
        <div className="card p-5">
          <div className="text-xs font-semibold text-[#9a9aa8]">
            How often you finish what you plan · last 14 days
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div
              className={`font-display text-[40px] font-extrabold tracking-tight ${calGood ? "calibration-good" : "calibration-neutral"}`}
            >
              {calPct === null ? "—" : `${calPct}%`}
            </div>
            {calGood ? (
              <div className="text-[13px] font-semibold text-[#2fae5b]">on target</div>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-[#6b6f7d]">
            You finish what you plan.{" "}
            <strong className="font-semibold text-[#17181f]">
              {doneToday} of {total || "—"}
            </strong>{" "}
            done today.
          </p>
        </div>

        <div className="card p-5">
          {northStar ? (
            <>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#9a9aa8]">
                <span className="h-2 w-2 rounded-[3px]" style={{ background: northStarHex }} />
                North star · {northStar.name}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <div className="font-display text-[40px] font-extrabold tracking-tight">
                  {northStar.currentValue}
                  <span className="text-[22px] text-[#9a9aa8]">{northStar.unit ? ` ${northStar.unit}` : ""}</span>
                </div>
              </div>
              <div className="text-[13px] font-semibold text-[#9a9aa8]">
                target {northStar.targetValue}
                {northStar.unit ? ` ${northStar.unit}` : ""}
              </div>
              <MiniSparkline readings={northStarReadings} color={northStarHex} />
            </>
          ) : (
            <p className="text-sm text-[#9a9aa8]">Pin a north star metric in Metrics to see it here.</p>
          )}
        </div>

        <div
          className="rounded-2xl border border-[#f3e2c4] p-5 shadow-sm"
          style={{ background: "linear-gradient(120deg,#fff,#fffaf3)" }}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-[#9a9aa8]">
            What you usually get done
            <span className="rounded bg-[#fbefd6] px-1.5 py-0.5 text-[10px] font-bold text-[#c98a1e]">LAST 14 DAYS</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="font-display text-[40px] font-extrabold tracking-tight">
              {usualMinutes}
              <span className="text-[20px] text-[#9a9aa8]"> min</span>
            </div>
            <div className="text-[13px] font-semibold text-[#9a9aa8]">≈ {realCapacity.toFixed(1)} tasks / day</div>
          </div>
          <div className="relative mb-2 mt-2 h-2 overflow-visible rounded-md bg-[#f0ead9]">
            <div
              className="h-full rounded-md"
              style={{
                width: `${Math.min(100, usualMinutes ? (plannedMinutes / usualMinutes) * 100 : 0)}%`,
                background: "linear-gradient(90deg,#e8b84a,#e08a2b)",
              }}
            />
          </div>
          {overPlan ? (
            <p className="text-[12.5px] font-semibold leading-snug text-[#b5731a]">
              You planned <strong>{plannedMinutes} min</strong> today, {plannedMinutes - usualMinutes} more than you
              usually finish. Not a wall, just the number.
            </p>
          ) : (
            <p className="text-[12.5px] text-[#9a9aa8]">Today&apos;s plan fits your recent pace.</p>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div>
          <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
            <div className="font-display text-base font-bold">Today&apos;s plan</div>
            {locked ? (
              <span className="flex items-center gap-1.5 rounded-full border border-[#c9edd4] bg-[#e7f7ec] px-2.5 py-1 text-[11px] font-bold tracking-wide text-[#2fae5b]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2fae5b]" />
                LOCKED {new Date(day!.lockedAt!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toUpperCase()}
              </span>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-[10px] border border-[#e6e6ee] bg-white px-3 py-1.5 text-[13px] font-semibold"
                  disabled={isPending}
                  onClick={() =>
                  startTransition(async () => {
                    const res = await generateMorningProposal();
                    setProposalNote(res.message);
                    router.refresh();
                  })
                }
                >
                  Generate proposal
                </button>
                <button
                  type="button"
                  className="rounded-[10px] bg-[#17181f] px-3 py-1.5 text-[13px] font-semibold text-white"
                  disabled={isPending || total === 0}
                  onClick={() => startTransition(() => lockDay())}
                >
                  Lock day
                </button>
              </div>
            )}
            <span className="ml-auto text-[12.5px] text-[#9a9aa8]">
              New stuff goes to your{" "}
              <Link href="/triage" className="font-semibold text-[#6d4aff]">
                inbox ({triageCount})
              </Link>
            </span>
          </div>

          <div className="card overflow-hidden">
            {filteredCommitted.length === 0 ? (
              <div className="px-5 py-8 text-center text-[13px] text-[#a7a7b3]">
                Nothing planned in {focusArea?.name ?? "any area"} today. Pull something in from your inbox, or enjoy the
                quiet.
              </div>
            ) : (
              filteredCommitted.map((t, i) => {
                const area = areaById.get(t.areaId);
                const done = isTerminal(t.status);
                const hex = area ? areaHex(area.colorToken) : "#6d4aff";
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-5 py-3.5 ${i > 0 ? "border-t border-[#f4f4f8]" : ""}`}
                  >
                    <button
                      type="button"
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border-2"
                      style={{
                        borderColor: done ? hex : "#d8d8e2",
                        background: done ? hex : "transparent",
                        color: done ? "#fff" : "transparent",
                      }}
                      onClick={() => startTransition(() => completeTask(t.id))}
                    >
                      {done ? "✓" : ""}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[14px] font-semibold ${done ? "text-[#a7a7b3] line-through" : "text-[#1c1c24]"}`}>
                        {t.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {area && <AreaTag name={area.name} colorToken={area.colorToken} />}
                        {t.goalId && <span className="text-xs text-[#a7a7b3]">linked goal</span>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {t.scheduledAt && (
                        <span className="text-xs font-semibold text-[#6b6f7d]">
                          {new Date(t.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      {t.size && (
                        <span className="rounded-md bg-[#f4f4f8] px-2 py-0.5 text-[10.5px] font-bold text-[#9a9aa8]">
                          {t.size}
                        </span>
                      )}
                    </div>
                    {locked && !done && (
                      <button
                        type="button"
                        className="text-xs text-[#9a9aa8] hover:underline"
                        onClick={() => {
                          const reason = window.prompt("Reason for dropping this task?");
                          if (reason !== null) startTransition(() => dropCommittedTask(t.id, reason));
                        }}
                      >
                        Drop
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
            <div className="font-display text-[15px] font-bold">Check on</div>
            <span className="text-xs text-[#9a9aa8]">waiting on other people — doesn&apos;t count against your day</span>
          </div>
          <div className="flex flex-col gap-2">
            {filteredDelegated.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#dcdce4] bg-[#fbfbfd] px-4 py-4 text-center text-[13px] text-[#a7a7b3]">
                Nobody to chase in {focusArea?.name ?? "this filter"}. This one&apos;s all you.
              </div>
            ) : (
              filteredDelegated.map((t) => {
                const area = areaById.get(t.areaId);
                const who = t.assigneeId ? assigneeById.get(t.assigneeId) : null;
                const bg = area ? areaHex(area.colorToken) : "#6d4aff";
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-dashed border-[#dcdce4] bg-[#fbfbfd] px-4 py-3"
                  >
                    <div
                      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                      style={{ background: bg }}
                    >
                      {who ? initials(who.name) : "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-[#2a2a33]">{t.title}</div>
                      <div className="text-xs text-[#a7a7b3]">
                        {who?.name ?? "Unassigned"} · {area?.name}
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6b6f7d]">
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="card p-5">
            <div className="font-display mb-3.5 text-[15px] font-bold">This week&apos;s habits</div>
            <div className="flex flex-col gap-3.5">
              {filteredCadence.length === 0 ? (
                <p className="text-[13px] text-[#a7a7b3]">No weekly habits for this focus.</p>
              ) : (
                filteredCadence.map((r) => (
                  <CadenceRow key={r.id} rule={r} area={areaById.get(r.areaId)} />
                ))
              )}
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_12px_28px_-14px_rgba(109,74,255,0.8)]"
            style={{ background: "linear-gradient(135deg,#6d4aff,#8b5cf6)" }}
          >
            <div className="absolute -right-6 -top-6 h-[110px] w-[110px] rounded-full bg-white/10" />
            <div className="text-xs font-semibold opacity-90">If it isn&apos;t written down, it doesn&apos;t get worked.</div>
            <div className="font-display mt-2 text-[17px] font-bold">{triageCount} things to sort</div>
            <p className="mb-3.5 mt-1 text-[12.5px] opacity-90">
              Sort them before Friday. New ideas need a reason before they become real work.
            </p>
            <Link
              href="/triage"
              className="inline-block rounded-[9px] bg-white px-3.5 py-2 text-[13px] font-bold text-[#6d4aff]"
            >
              Sort them →
            </Link>
          </div>

          <div className="card p-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[#9a9aa8]">Quick capture</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                className="rounded-[10px] border border-[#e6e6ee] bg-white px-2 py-2 text-sm"
                value={quickAddArea}
                onChange={(e) => setQuickAddArea(e.target.value)}
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                className="flex-1 rounded-[10px] border border-[#e6e6ee] px-3 py-2 text-sm"
                placeholder="Quick add to triage…"
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && quickAddTitle.trim()) {
                    startTransition(() => quickAddToTriage(quickAddTitle.trim(), quickAddArea));
                    setQuickAddTitle("");
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

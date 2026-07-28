"use client";

import { useState, useTransition } from "react";
import { PageHeader } from "@/components/PageHeader";
import { AreaTag } from "@/components/AreaTag";
import type { Area, CadenceRule, Day, Metric, Nudge, Task } from "@/lib/types";
import {
  generateMorningProposal, lockDay, completeTask, dropCommittedTask,
  quickAddToTriage, dismissNudge,
} from "./actions";

function isTerminal(status: string) {
  return ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"].includes(status);
}

export function TodayClient({
  date, day, areas, committedTasks, delegatedChecks, triageCount,
  cadenceRules, calibration14d, realCapacity, northStar, nudges,
}: {
  date: string;
  day: Day | null;
  areas: Area[];
  committedTasks: Task[];
  delegatedChecks: Task[];
  triageCount: number;
  cadenceRules: CadenceRule[];
  calibration14d: number | null;
  realCapacity: number;
  northStar: Metric | null;
  nudges: Nudge[];
}) {
  const [isPending, startTransition] = useTransition();
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const [quickAddArea, setQuickAddArea] = useState(areas[0]?.id ?? "");
  const areaById = new Map(areas.map((a) => [a.id, a]));

  const locked = Boolean(day?.lockedAt);
  const closed = committedTasks.filter((t) => isTerminal(t.status)).length;
  const total = committedTasks.length;

  return (
    <div>
      <PageHeader
        title={`Today · ${new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
        subtitle={
          locked
            ? `Locked at ${new Date(day!.lockedAt!).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${total} committed`
            : `${total} committed · not locked yet`
        }
        actions={
          !locked ? (
            <div className="flex gap-2">
              <button
                className="rounded-md border hairline px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                disabled={isPending}
                onClick={() => startTransition(() => generateMorningProposal())}
              >
                Generate proposal
              </button>
              <button
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--bg)]"
                disabled={isPending || total === 0}
                onClick={() => startTransition(() => lockDay())}
              >
                Lock day
              </button>
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {nudges.length > 0 && (
            <div className="space-y-2">
              {nudges.map((n) => (
                <div
                  key={n.id}
                  className="card flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span>{n.message}</span>
                  <button
                    className="muted text-xs hover:underline"
                    onClick={() => startTransition(() => dismissNudge(n.id))}
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          )}

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-medium">Committed</h2>
            {committedTasks.length === 0 ? (
              <p className="muted text-sm">
                Nothing committed yet. Generate a proposal from available time, then lock it in.
              </p>
            ) : (
              <ul className="divide-y hairline">
                {committedTasks.map((t) => {
                  const area = areaById.get(t.areaId);
                  const done = isTerminal(t.status);
                  return (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => startTransition(() => completeTask(t.id))}
                        className="h-4 w-4"
                      />
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${done ? "line-through muted" : ""}`}>{t.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs muted">
                          {area && <AreaTag name={area.name} colorToken={area.colorToken} />}
                          {t.size && <span>{t.size}</span>}
                          {t.scheduledAt && (
                            <span>{new Date(t.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                          )}
                        </div>
                      </div>
                      {locked && !done && (
                        <button
                          className="text-xs muted hover:underline"
                          onClick={() => {
                            const reason = window.prompt("Reason for dropping this task?");
                            if (reason !== null) {
                              startTransition(() => dropCommittedTask(t.id, reason));
                            }
                          }}
                        >
                          Drop
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {delegatedChecks.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 text-sm font-medium">Check on <span className="muted font-normal">— outside capacity</span></h2>
              <ul className="divide-y hairline">
                {delegatedChecks.map((t) => {
                  const area = areaById.get(t.areaId);
                  return (
                    <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div>
                        <div>{t.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs muted">
                          {area && <AreaTag name={area.name} colorToken={area.colorToken} />}
                          <span>{t.status.replace("_", " ")}</span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-medium">Cadence this week</h2>
            {cadenceRules.length === 0 ? (
              <p className="muted text-sm">No cadence rules yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {cadenceRules.map((r) => (
                  <span key={r.id} className="rounded-full border hairline px-3 py-1 text-xs">
                    {r.title} {r.currentWeekCount}/{r.targetPerWeek}
                    {r.minPerWeek ? ` (range ${r.minPerWeek}-${r.targetPerWeek})` : ""}
                  </span>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-sm font-medium">Triage</h2>
            <div className="flex items-center justify-between">
              <p className="text-sm">
                <span className="font-semibold">{triageCount}</span>{" "}
                <span className="muted">item{triageCount === 1 ? "" : "s"} waiting</span>
              </p>
              <a href="/triage" className="text-sm muted hover:underline">Open triage →</a>
            </div>
            <div className="mt-3 flex gap-2">
              <select
                className="rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
                value={quickAddArea}
                onChange={(e) => setQuickAddArea(e.target.value)}
              >
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <input
                className="flex-1 rounded-md border hairline bg-transparent px-2 py-1.5 text-sm"
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
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <div className="text-xs muted">Calibration, 14 days</div>
            <div className="mt-1 text-2xl font-semibold calibration-neutral">
              {calibration14d === null ? "—" : `${Math.round(calibration14d * 100)}%`}
            </div>
            <p className="mt-1 text-xs muted">A 3 of 3 day beats a 6 of 12 day. This is calibration, not a verdict.</p>
          </div>
          {northStar && (
            <div className="card p-4">
              <div className="text-xs muted">{northStar.name}</div>
              <div className="mt-1 text-2xl font-semibold">
                {northStar.currentValue}
                <span className="text-sm muted"> / {northStar.targetValue} {northStar.unit}</span>
              </div>
            </div>
          )}
          <div className="card p-4">
            <div className="text-xs muted">Real capacity, 14-day avg</div>
            <div className="mt-1 text-2xl font-semibold">{realCapacity.toFixed(1)}<span className="text-sm muted"> tasks/day</span></div>
            {total > realCapacity * 1.3 && total > 0 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Today&apos;s commit ({total}) is above your real average.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

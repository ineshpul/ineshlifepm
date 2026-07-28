import {
  listAreas, listTasks, getDay, listCadenceRules, listInitiatives, listGoals,
  listMetrics, listDays,
} from "@/lib/repo";
import { todayDateString, startOfWeek } from "@/lib/dates";
import { commitmentKeptPct, estimateAccuracyPct, realCapacity } from "@/lib/scoring";
import { computeAllNudges, topNudges } from "@/lib/nudges";
import { TodayClient } from "./TodayClient";

export default async function TodayPage() {
  const date = todayDateString();
  const [areas, tasks, day, cadenceRules, initiatives, goals, metrics, recentDays] =
    await Promise.all([
      listAreas(),
      listTasks(),
      getDay(date),
      listCadenceRules(),
      listInitiatives(),
      listGoals(),
      listMetrics(),
      listDays(),
    ]);

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const committedTasks = (day?.committedTaskIds ?? [])
    .map((id) => taskById.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  const delegatedChecks = tasks.filter(
    (t) => t.type === "delegated" && !["accepted"].includes(t.status)
  );

  const triageCount = tasks.filter((t) => t.status === "triage").length;

  const week = startOfWeek();
  const thisWeekRules = cadenceRules.filter((r) => r.weekOf === week || !r.weekOf);

  // Calibration 14d
  const last14 = recentDays
    .filter((d) => d.commitmentKeptPct !== null)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 14);
  const calibration14d =
    last14.length > 0
      ? last14.reduce((s, d) => s + (d.commitmentKeptPct ?? 0), 0) / last14.length
      : null;

  const realCap = realCapacity(
    recentDays
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 14)
      .map((d) => d.committedTaskIds.length)
  );

  const northStar = metrics.find((m) => m.isNorthStar);

  const activeInitiatives = initiatives.filter(
    (i) => i.status !== "parked" || (i.restartAt && new Date(i.restartAt) <= new Date())
  );
  const delegatedForNudges = tasks.filter((t) => t.type === "delegated");
  const allNudges = computeAllNudges({
    initiatives: activeInitiatives,
    cadenceRules: thisWeekRules,
    delegatedTasks: delegatedForNudges,
    goals,
    metrics,
    learningActiveCount: tasks.filter((t) => t.type === "learning" && t.status === "active").length,
  });
  const dismissed = new Set(day?.dismissedNudgeIds ?? []);
  const visibleNudges = topNudges(allNudges.filter((n) => !dismissed.has(n.id)), 3);

  return (
    <TodayClient
      date={date}
      day={day}
      areas={areas}
      committedTasks={committedTasks}
      delegatedChecks={delegatedChecks}
      triageCount={triageCount}
      cadenceRules={thisWeekRules}
      calibration14d={calibration14d}
      realCapacity={realCap}
      northStar={northStar ?? null}
      nudges={visibleNudges}
    />
  );
}

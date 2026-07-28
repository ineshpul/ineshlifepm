import { PageHeader } from "@/components/PageHeader";
import {
  listAreas, listTasks, listDays, listCadenceRules, listInitiatives, listGoals, listMetrics,
} from "@/lib/repo";
import { startOfWeek, daysSince, formatDate } from "@/lib/dates";
import { computeAllNudges } from "@/lib/nudges";

const CLOSED_STATUSES = ["shipped", "accepted", "submitted", "artifact_produced", "done", "logged"];

export default async function WeeklyReviewPage() {
  const [areas, tasks, days, cadenceRules, initiatives, goals, metrics] = await Promise.all([
    listAreas(), listTasks(), listDays(), listCadenceRules(), listInitiatives(), listGoals(), listMetrics(),
  ]);

  const weekStart = startOfWeek();
  const weekStartDate = new Date(weekStart);
  const inThisWeek = (iso: string | null) => Boolean(iso) && new Date(iso!) >= weekStartDate;

  const closed = tasks.filter((t) => t.closedAt && inThisWeek(t.closedAt));
  const slipped = tasks.filter((t) => t.droppedReason && inThisWeek(t.lastTouchedAt));
  const added = tasks.filter((t) => inThisWeek(t.createdAt));

  const weekDays = days.filter((d) => d.date >= weekStart);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const dailyKept = weekDays
    .map((d) => {
      const committed = d.committedTaskIds.map((id) => taskById.get(id)).filter(Boolean) as typeof tasks;
      if (committed.length === 0) return null;
      const done = committed.filter((t) => CLOSED_STATUSES.includes(t.status)).length;
      return done / committed.length;
    })
    .filter((v): v is number => v !== null);
  const weekCalibration = dailyKept.length ? dailyKept.reduce((a, b) => a + b, 0) / dailyKept.length : null;

  const areaLastTouched = new Map<string, string>();
  for (const t of tasks) {
    const prev = areaLastTouched.get(t.areaId);
    if (!prev || t.lastTouchedAt > prev) areaLastTouched.set(t.areaId, t.lastTouchedAt);
  }
  const untouchedAreas = areas.filter((a) => {
    const last = areaLastTouched.get(a.id);
    return !last || daysSince(last) >= 7;
  });

  const triageCount = tasks.filter((t) => t.status === "triage").length;

  const activeInitiatives = initiatives.filter(
    (i) => i.status !== "parked" || (i.restartAt && new Date(i.restartAt) <= new Date())
  );
  const allNudges = computeAllNudges({
    initiatives: activeInitiatives,
    cadenceRules,
    delegatedTasks: tasks.filter((t) => t.type === "delegated"),
    goals,
    metrics,
    learningActiveCount: tasks.filter((t) => t.type === "learning" && t.status === "active").length,
  });

  return (
    <div>
      <PageHeader title="Weekly review" subtitle={`Week of ${formatDate(weekStart)}`} />
      <div className="space-y-6 p-6 md:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Calibration this week" value={weekCalibration === null ? "—" : `${Math.round(weekCalibration * 100)}%`} />
          <Stat label="Closed this week" value={String(closed.length)} />
          <Stat label="Triage" value={triageCount === 0 ? "Clear" : `${triageCount} waiting`} />
        </div>

        <Section title="What closed">
          <TaskList tasks={closed} areas={areas} empty="Nothing closed this week." />
        </Section>

        <Section title="What slipped">
          <TaskList tasks={slipped} areas={areas} showReason empty="Nothing dropped this week." />
        </Section>

        <Section title="Added mid-week">
          <TaskList tasks={added} areas={areas} empty="Nothing new added this week." />
        </Section>

        <Section title="Areas untouched 7+ days">
          {untouchedAreas.length === 0 ? <p className="muted text-sm">Every area was touched this week.</p> : (
            <ul className="flex flex-wrap gap-2">
              {untouchedAreas.map((a) => <li key={a.id} className="rounded-full border hairline px-2 py-0.5 text-xs">{a.name}</li>)}
            </ul>
          )}
        </Section>

        <Section title="Cadence completion">
          <div className="flex flex-wrap gap-2">
            {cadenceRules.map((r) => (
              <span key={r.id} className={`rounded-full border hairline px-3 py-1 text-xs ${r.currentWeekCount >= r.targetPerWeek ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                {r.title} {r.currentWeekCount}/{r.targetPerWeek}
              </span>
            ))}
          </div>
        </Section>

        <Section title={`All undismissed nudges (${allNudges.length})`}>
          {allNudges.length === 0 ? <p className="muted text-sm">Nothing outstanding.</p> : (
            <ul className="space-y-1.5 text-sm">
              {allNudges.map((n) => <li key={n.id}>{n.message}</li>)}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function TaskList({
  tasks, areas, showReason, empty,
}: {
  tasks: { id: string; title: string; areaId: string; droppedReason: string | null }[];
  areas: { id: string; name: string; colorToken: string }[];
  showReason?: boolean;
  empty: string;
}) {
  if (tasks.length === 0) return <p className="muted text-sm">{empty}</p>;
  const areaById = new Map(areas.map((a) => [a.id, a]));
  return (
    <ul className="space-y-1.5 text-sm">
      {tasks.map((t) => (
        <li key={t.id} className="flex items-center gap-2">
          <span>{t.title}</span>
          <span className="text-xs muted">{areaById.get(t.areaId)?.name}</span>
          {showReason && t.droppedReason && <span className="text-xs muted">— {t.droppedReason}</span>}
        </li>
      ))}
    </ul>
  );
}

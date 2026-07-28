import { PageHeader } from "@/components/PageHeader";
import { AreaTag } from "@/components/AreaTag";
import { listAreas, listVisionItems, listGoals, listMetrics, listReadingsForMetric } from "@/lib/repo";
import { daysSince, formatDate } from "@/lib/dates";
import { Sparkline } from "@/app/metrics/Sparkline";

export default async function MonthlyReviewPage() {
  const [areas, visionItems, goals, metrics] = await Promise.all([
    listAreas(), listVisionItems(), listGoals(), listMetrics(),
  ]);
  const readings = await Promise.all(metrics.map((m) => listReadingsForMetric(m.id)));
  const readingsByMetric = Object.fromEntries(metrics.map((m, i) => [m.id, readings[i]]));

  const areaById = new Map(areas.map((a) => [a.id, a]));
  const activeGoalIds = new Set(goals.filter((g) => g.status === "active").map((g) => g.id));

  const dormantFlagged = visionItems.filter((v) => {
    if (v.status !== "dormant") return false;
    const hasActiveLinkedGoal = v.linkedGoalIds.some((id) => activeGoalIds.has(id));
    if (hasActiveLinkedGoal) return false;
    return daysSince(v.lastActivatedAt ?? v.createdAt) > 90;
  });

  const activeGoals = goals.filter((g) => g.status === "active");
  const parkedGoals = goals.filter((g) => g.status === "parked");

  return (
    <div>
      <PageHeader title="Monthly review" subtitle="Vision pass, dormant items, goal state, 30-day metric trends." />
      <div className="space-y-6 p-6 md:p-8">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Dormant vision items, 90+ days, no active goal</h2>
          {dormantFlagged.length === 0 ? <p className="muted text-sm">Nothing to surface.</p> : (
            <ul className="space-y-2">
              {dormantFlagged.map((v) => {
                const area = areaById.get(v.areaId);
                return (
                  <li key={v.id} className="flex items-center gap-2 text-sm">
                    {area && <AreaTag name={area.name} colorToken={area.colorToken} />}
                    <span>{v.title}</span>
                    <span className="text-xs muted">— dormant {daysSince(v.lastActivatedAt ?? v.createdAt)} days</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Currently active goals</h2>
          {activeGoals.length === 0 ? <p className="muted text-sm">None active.</p> : (
            <ul className="space-y-1 text-sm">
              {activeGoals.map((g) => <li key={g.id}>{g.title} <span className="muted text-xs">— target {formatDate(g.targetDate)}</span></li>)}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Currently parked goals</h2>
          {parkedGoals.length === 0 ? <p className="muted text-sm">None parked.</p> : (
            <ul className="space-y-1 text-sm">
              {parkedGoals.map((g) => <li key={g.id}>{g.title}</li>)}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="mb-3 text-sm font-medium">Metric trends, 30 days</h2>
          <div className="space-y-3">
            {metrics.map((m) => {
              const last30 = (readingsByMetric[m.id] ?? []).filter((r) => daysSince(r.recordedAt) <= 30);
              return (
                <div key={m.id} className="flex items-center justify-between">
                  <span className="text-sm">{m.name}</span>
                  <Sparkline readings={last30} target={m.targetValue} />
                </div>
              );
            })}
            {metrics.length === 0 && <p className="muted text-sm">No metrics yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import {
  getInitiative, listAreas, listAssignees, listGoals, listMetrics, listTasks, listReadingsForMetric,
} from "@/lib/repo";
import { InitiativeDetailClient } from "./InitiativeDetailClient";

export default async function InitiativeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const initiative = await getInitiative(id);
  if (!initiative) notFound();

  const [areas, assignees, goals, metrics, tasks] = await Promise.all([
    listAreas(), listAssignees(), listGoals(), listMetrics(), listTasks(),
  ]);

  const linkedMetrics = metrics.filter((m) => initiative.metricIds.includes(m.id));
  const readings = await Promise.all(linkedMetrics.map((m) => listReadingsForMetric(m.id)));
  const readingsByMetric = Object.fromEntries(linkedMetrics.map((m, i) => [m.id, readings[i]]));

  return (
    <InitiativeDetailClient
      initiative={initiative}
      areas={areas}
      assignees={assignees}
      goals={goals.filter((g) => initiative.goalIds.includes(g.id) || g.initiativeId === initiative.id)}
      allGoals={goals}
      metrics={linkedMetrics}
      allMetrics={metrics}
      readingsByMetric={readingsByMetric}
      tasks={tasks.filter((t) => t.initiativeId === initiative.id)}
    />
  );
}

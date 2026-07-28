import { listAreas, listMetrics, listReadingsForMetric } from "@/lib/repo";
import { MetricsClient } from "./MetricsClient";

export default async function MetricsPage() {
  const [areas, metrics] = await Promise.all([listAreas(), listMetrics()]);
  const readings = await Promise.all(metrics.map((m) => listReadingsForMetric(m.id)));
  const readingsByMetric = Object.fromEntries(metrics.map((m, i) => [m.id, readings[i]]));

  return <MetricsClient areas={areas} metrics={metrics} readingsByMetric={readingsByMetric} />;
}

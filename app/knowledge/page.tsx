import { listKnowledgeEntries, listGoals, listTasks, listAreas, listInitiatives } from "@/lib/repo";
import { KnowledgeClient } from "./KnowledgeClient";

export default async function KnowledgePage() {
  const [entries, goals, tasks, areas, initiatives] = await Promise.all([
    listKnowledgeEntries(),
    listGoals(),
    listTasks(),
    listAreas(),
    listInitiatives(),
  ]);
  return <KnowledgeClient entries={entries} goals={goals} tasks={tasks} areas={areas} initiatives={initiatives} />;
}

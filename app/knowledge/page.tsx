import { listKnowledgeEntries, listGoals, listTasks } from "@/lib/repo";
import { KnowledgeClient } from "./KnowledgeClient";

export default async function KnowledgePage() {
  const [entries, goals, tasks] = await Promise.all([listKnowledgeEntries(), listGoals(), listTasks()]);
  return <KnowledgeClient entries={entries} goals={goals} tasks={tasks} />;
}

import { listAreas, listAssignees, listTasks, listGoals } from "@/lib/repo";
import { DelegatedClient } from "./DelegatedClient";

export default async function DelegatedPage() {
  const [areas, assignees, tasks, goals] = await Promise.all([
    listAreas(), listAssignees(), listTasks(), listGoals(),
  ]);
  const delegated = tasks.filter((t) => t.type === "delegated");
  return <DelegatedClient areas={areas} assignees={assignees} tasks={delegated} goals={goals} />;
}

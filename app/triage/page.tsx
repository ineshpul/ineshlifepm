import { listAreas, listTasks, listGoals, listAssignees } from "@/lib/repo";
import { TriageClient } from "./TriageClient";

export default async function TriagePage() {
  const [areas, tasks, goals, assignees] = await Promise.all([
    listAreas(), listTasks(), listGoals(), listAssignees(),
  ]);
  const triageTasks = tasks.filter((t) => t.status === "triage");
  return <TriageClient areas={areas} tasks={triageTasks} goals={goals} assignees={assignees} />;
}

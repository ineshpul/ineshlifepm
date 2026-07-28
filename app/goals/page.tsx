import { listAreas, listGoals, listTasks, listVisionItems, listInitiatives } from "@/lib/repo";
import { GoalsClient } from "./GoalsClient";

export default async function GoalsPage() {
  const [areas, goals, tasks, visionItems, initiatives] = await Promise.all([
    listAreas(),
    listGoals(),
    listTasks(),
    listVisionItems(),
    listInitiatives(),
  ]);

  return (
    <GoalsClient
      areas={areas}
      goals={goals}
      tasks={tasks}
      visionItems={visionItems}
      initiatives={initiatives}
    />
  );
}

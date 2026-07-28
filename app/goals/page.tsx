import { listAreas, listGoals, listTasks, listVisionItems, listInitiatives, listGoalProgressLogs } from "@/lib/repo";
import { GoalsClient } from "./GoalsClient";
import type { GoalProgressLog } from "@/lib/types";

export default async function GoalsPage() {
  const [areas, goals, tasks, visionItems, initiatives] = await Promise.all([
    listAreas(),
    listGoals(),
    listTasks(),
    listVisionItems(),
    listInitiatives(),
  ]);

  const progressByGoal: Record<string, GoalProgressLog[]> = {};
  await Promise.all(
    goals.map(async (g) => {
      progressByGoal[g.id] = await listGoalProgressLogs(g.id);
    })
  );

  return (
    <GoalsClient
      areas={areas}
      goals={goals}
      tasks={tasks}
      visionItems={visionItems}
      initiatives={initiatives}
      progressByGoal={progressByGoal}
    />
  );
}

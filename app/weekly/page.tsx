import { listAreas, listTasks, getSettings } from "@/lib/repo";
import { WeeklyClient } from "./WeeklyClient";

export default async function WeeklyPage() {
  const [areas, tasks, settings] = await Promise.all([listAreas(), listTasks(), getSettings()]);
  return <WeeklyClient areas={areas} tasks={tasks} recurringBlocks={settings.recurringBlocks} />;
}

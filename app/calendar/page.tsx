import { listAreas, listTasks, getSettings } from "@/lib/repo";
import { CalendarClient } from "./CalendarClient";

export default async function CalendarPage() {
  const [areas, tasks, settings] = await Promise.all([listAreas(), listTasks(), getSettings()]);
  return <CalendarClient areas={areas} tasks={tasks} recurringBlocks={settings.recurringBlocks} />;
}

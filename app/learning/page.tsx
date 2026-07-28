import { listAreas, listTasks } from "@/lib/repo";
import { LearningClient } from "./LearningClient";

export default async function LearningPage() {
  const [areas, tasks] = await Promise.all([listAreas(), listTasks()]);
  const learning = tasks.filter((t) => t.type === "learning" && t.status !== "artifact_produced");
  return <LearningClient areas={areas} tasks={learning} />;
}

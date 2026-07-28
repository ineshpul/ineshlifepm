import { listAreas, listInitiatives, listAssignees, listGoals } from "@/lib/repo";
import { InitiativesIndexClient } from "./InitiativesIndexClient";

export default async function InitiativesIndexPage() {
  const [areas, initiatives, assignees, goals] = await Promise.all([
    listAreas(), listInitiatives(), listAssignees(), listGoals(),
  ]);
  return <InitiativesIndexClient areas={areas} initiatives={initiatives} assignees={assignees} goals={goals} />;
}

import { getSettings, listAreas, listAssignees, listCadenceRules } from "@/lib/repo";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const [settings, areas, assignees, cadenceRules] = await Promise.all([
    getSettings(), listAreas(), listAssignees(), listCadenceRules(),
  ]);
  return <SettingsClient settings={settings} areas={areas} assignees={assignees} cadenceRules={cadenceRules} />;
}

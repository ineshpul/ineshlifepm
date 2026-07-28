import { getSettings, listAreas, listAssignees, listCadenceRules } from "@/lib/repo";
import { listPendingInvites } from "./team-actions";
import { SettingsClient } from "./SettingsClient";

export default async function SettingsPage() {
  const [settings, areas, assignees, cadenceRules, invites] = await Promise.all([
    getSettings(),
    listAreas(),
    listAssignees(),
    listCadenceRules(),
    listPendingInvites(),
  ]);
  return (
    <SettingsClient
      settings={settings}
      areas={areas}
      assignees={assignees}
      cadenceRules={cadenceRules}
      pendingInvites={invites}
    />
  );
}

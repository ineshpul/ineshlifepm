// Seeds life areas only — no sample tasks, metrics, goals, or initiatives.
// To wipe old demo data: npm run seed:reset
import { getSettings, listAreas, saveArea, deleteArea, listTasks, deleteTask, listMetrics, deleteMetric, listGoals, deleteGoal, listVisionItems, deleteVisionItem, listKnowledgeEntries, deleteKnowledgeEntry, listDays, saveSettings, saveDay, getWorkspace, saveWorkspace } from "../lib/repo";
import { SEED_AREAS } from "../lib/constants";
import { DEFAULT_WORKSPACE_ID } from "../lib/types";
import { supabase, TABLES, throwIfError, nowIso } from "../lib/db";

async function deleteAllRows(table: string) {
  const { data, error: selErr } = await supabase().from(table).select("id");
  throwIfError(selErr);
  for (const row of data ?? []) {
    const { error } = await supabase().from(table).delete().eq("id", row.id);
    throwIfError(error);
  }
}

async function clearSampleContent() {
  console.log("CLEAR_CONTENT=1 — removing tasks, metrics, goals, initiatives, and other sample rows…");
  for (const t of await listTasks()) await deleteTask(t.id);
  for (const m of await listMetrics()) await deleteMetric(m.id);
  await deleteAllRows(TABLES.metricReadings);
  for (const g of await listGoals()) await deleteGoal(g.id);
  await deleteAllRows(TABLES.initiatives);
  for (const v of await listVisionItems()) await deleteVisionItem(v.id);
  for (const k of await listKnowledgeEntries()) await deleteKnowledgeEntry(k.id);
  await deleteAllRows(TABLES.cadenceRules);
  await deleteAllRows(TABLES.userChats);
  for (const d of await listDays()) {
    await saveDay({ ...d, committedTaskIds: [], notes: "", dismissedNudgeIds: [] });
  }
  console.log("Ensuring default workspace…");
  if (!(await getWorkspace(DEFAULT_WORKSPACE_ID))) {
    await saveWorkspace({
      id: DEFAULT_WORKSPACE_ID,
      name: "My workspace",
      createdAt: nowIso(),
      ownerUserId: null,
    });
  }

  const settings = await getSettings();
  await saveSettings({ ...settings, recurringBlocks: [] });
}

async function main() {
  const shouldClear = process.env.CLEAR_CONTENT === "1" || process.argv.includes("--reset");
  if (shouldClear) {
    await clearSampleContent();
  }

  console.log("Seeding areas (structure only, no filler data)…");
  const allowed = new Set<string>(SEED_AREAS.map((a) => a.id));
  for (const a of SEED_AREAS) {
    await saveArea({ ...a });
  }
  for (const area of await listAreas()) {
    if (!allowed.has(area.id)) {
      await deleteArea(area.id);
      console.log(`Removed area: ${area.name} (${area.id})`);
    }
  }

  const existing = await listAreas();
  console.log(`Areas in database: ${existing.length}`);

  console.log("Ensuring default workspace…");
  if (!(await getWorkspace(DEFAULT_WORKSPACE_ID))) {
    await saveWorkspace({
      id: DEFAULT_WORKSPACE_ID,
      name: "My workspace",
      createdAt: nowIso(),
      ownerUserId: null,
    });
  }

  console.log("Ensuring settings singleton exists…");
  await getSettings();

  console.log("Seed complete. Add metrics, goals, and tasks in the app.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

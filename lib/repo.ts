import {
  supabase,
  TABLES,
  SETTINGS_DOC_ID,
  nowIso,
  newId,
  throwIfError,
} from "./db";
import { DEFAULT_FOCUS_FACTOR, DEFAULT_MAX_NUDGES, DEFAULT_SIZE_MINUTES } from "./constants";
import type {
  Area,
  VisionItem,
  Goal,
  GoalProgressLog,
  Task,
  Assignee,
  Metric,
  MetricReading,
  Day,
  CadenceRule,
  KnowledgeEntry,
  UserChat,
  Initiative,
  Settings,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
} from "./types";
import { DEFAULT_WORKSPACE_ID } from "./types";
import { normalizeKnowledgeEntry } from "./goal-utils";

type DocRow = { document: unknown };

async function all<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase().from(table).select("document");
  throwIfError(error);
  return (data ?? []).map((row) => (row as DocRow).document as T);
}

async function one<T>(table: string, id: string): Promise<T | null> {
  const { data, error } = await supabase().from(table).select("document").eq("id", id).maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return (data as DocRow).document as T;
}

async function put<T extends { id: string }>(table: string, item: T): Promise<T> {
  const { error } = await supabase().from(table).upsert({ id: item.id, document: item });
  throwIfError(error);
  return item;
}

async function remove(table: string, id: string): Promise<void> {
  const { error } = await supabase().from(table).delete().eq("id", id);
  throwIfError(error);
}

// ---- Areas ----
export const listAreas = () => all<Area>(TABLES.areas);
export const getArea = (id: string) => one<Area>(TABLES.areas, id);
export const saveArea = (item: Area) => put(TABLES.areas, item);
export const deleteArea = (id: string) => remove(TABLES.areas, id);

// ---- Vision items ----
export const listVisionItems = () => all<VisionItem>(TABLES.visionItems);
export const getVisionItem = (id: string) => one<VisionItem>(TABLES.visionItems, id);
export const saveVisionItem = (item: VisionItem) => put(TABLES.visionItems, item);
export const deleteVisionItem = (id: string) => remove(TABLES.visionItems, id);

// ---- Goals ----
export const listGoals = () => all<Goal>(TABLES.goals);
export const getGoal = (id: string) => one<Goal>(TABLES.goals, id);
export const saveGoal = (item: Goal) => put(TABLES.goals, item);
export const deleteGoal = (id: string) => remove(TABLES.goals, id);

// ---- Tasks ----
export const listTasks = () => all<Task>(TABLES.tasks);
export const getTask = (id: string) => one<Task>(TABLES.tasks, id);
export const saveTask = (item: Task) => put(TABLES.tasks, item);
export const deleteTask = (id: string) => remove(TABLES.tasks, id);

// ---- Assignees ----
export const listAssignees = () => all<Assignee>(TABLES.assignees);
export const getAssignee = (id: string) => one<Assignee>(TABLES.assignees, id);
export const saveAssignee = (item: Assignee) => put(TABLES.assignees, item);

// ---- Metrics ----
export const listMetrics = () => all<Metric>(TABLES.metrics);
export const getMetric = (id: string) => one<Metric>(TABLES.metrics, id);
export const saveMetric = (item: Metric) => put(TABLES.metrics, item);
export const deleteMetric = (id: string) => remove(TABLES.metrics, id);

export async function listReadingsForMetric(metricId: string): Promise<MetricReading[]> {
  const { data, error } = await supabase()
    .from(TABLES.metricReadings)
    .select("document")
    .eq("metric_id", metricId)
    .order("recorded_at", { ascending: true });
  throwIfError(error);
  return (data ?? []).map((row) => (row as DocRow).document as MetricReading);
}

export async function addMetricReading(metricId: string, value: number): Promise<MetricReading> {
  const reading: MetricReading = { id: newId("reading"), metricId, value, recordedAt: nowIso() };
  const { error } = await supabase().from(TABLES.metricReadings).upsert({
    id: reading.id,
    metric_id: metricId,
    recorded_at: reading.recordedAt,
    document: reading,
  });
  throwIfError(error);
  const metric = await getMetric(metricId);
  if (metric) {
    await saveMetric({ ...metric, currentValue: value, updatedAt: nowIso() });
  }
  return reading;
}

// ---- Days ----
export const getDay = (date: string) => one<Day>(TABLES.days, date);
export const saveDay = (item: Day) => put(TABLES.days, item);
export const listDays = () => all<Day>(TABLES.days);

// ---- Cadence rules ----
export const listCadenceRules = () => all<CadenceRule>(TABLES.cadenceRules);
export const getCadenceRule = (id: string) => one<CadenceRule>(TABLES.cadenceRules, id);
export const saveCadenceRule = (item: CadenceRule) => put(TABLES.cadenceRules, item);

// ---- Knowledge entries ----
export const listKnowledgeEntries = () =>
  all<KnowledgeEntry>(TABLES.knowledgeEntries).then((rows) => rows.map(normalizeKnowledgeEntry));
export const saveKnowledgeEntry = (item: KnowledgeEntry) => put(TABLES.knowledgeEntries, item);
export const deleteKnowledgeEntry = (id: string) => remove(TABLES.knowledgeEntries, id);

// ---- User chats ----
export const listUserChats = () => all<UserChat>(TABLES.userChats);
export const saveUserChat = (item: UserChat) => put(TABLES.userChats, item);

// ---- Initiatives ----
export const listInitiatives = () => all<Initiative>(TABLES.initiatives);
export const getInitiative = (id: string) => one<Initiative>(TABLES.initiatives, id);
export const saveInitiative = (item: Initiative) => put(TABLES.initiatives, item);
export const deleteInitiative = (id: string) => remove(TABLES.initiatives, id);

// ---- Goal progress (daily quantifiable tracking) ----
export async function listGoalProgressLogs(goalId: string): Promise<GoalProgressLog[]> {
  const { data, error } = await supabase()
    .from(TABLES.goalProgressLogs)
    .select("document")
    .eq("goal_id", goalId)
    .order("logged_on", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((row) => (row as DocRow).document as GoalProgressLog);
}

export async function saveGoalProgressLog(log: GoalProgressLog): Promise<GoalProgressLog> {
  const { error } = await supabase().from(TABLES.goalProgressLogs).upsert({
    id: log.id,
    goal_id: log.goalId,
    logged_on: log.date,
    document: log,
  });
  throwIfError(error);
  return log;
}

export async function deleteGoalProgressLog(id: string): Promise<void> {
  const { error } = await supabase().from(TABLES.goalProgressLogs).delete().eq("id", id);
  throwIfError(error);
}

// ---- Workspaces (multi-user) ----
export const listWorkspaces = () => all<Workspace>(TABLES.workspaces);
export const getWorkspace = (id: string) => one<Workspace>(TABLES.workspaces, id);
export const saveWorkspace = (item: Workspace) => put(TABLES.workspaces, item);

export const listWorkspaceMembers = () => all<WorkspaceMember>(TABLES.workspaceMembers);
export const saveWorkspaceMember = (item: WorkspaceMember) =>
  put(TABLES.workspaceMembers, { ...item, id: item.id });

export const listWorkspaceInvites = () => all<WorkspaceInvite>(TABLES.workspaceInvites);
export const saveWorkspaceInvite = (item: WorkspaceInvite) => put(TABLES.workspaceInvites, item);
export const deleteWorkspaceInvite = (id: string) => remove(TABLES.workspaceInvites, id);

export async function getWorkspaceInviteByToken(token: string): Promise<WorkspaceInvite | null> {
  const allInvites = await listWorkspaceInvites();
  return allInvites.find((i) => i.token === token) ?? null;
}

// ---- Settings (singleton) ----
export async function getSettings(): Promise<Settings> {
  const existing = await one<Settings>(TABLES.settings, SETTINGS_DOC_ID);
  if (existing) {
    return {
      ...existing,
      activeWorkspaceId: existing.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID,
      workspaceName: existing.workspaceName ?? "My workspace",
    };
  }

  const defaults: Settings = {
    focusFactor: DEFAULT_FOCUS_FACTOR,
    sizeMinutes: DEFAULT_SIZE_MINUTES,
    calendarToken: newId("cal"),
    maxNudges: DEFAULT_MAX_NUDGES,
    recurringBlocks: [],
    workDayStartMinute: 540,
    workDayEndMinute: 1260,
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    workspaceName: "My workspace",
  };
  const { error } = await supabase()
    .from(TABLES.settings)
    .upsert({ id: SETTINGS_DOC_ID, document: defaults });
  throwIfError(error);
  return defaults;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  const { error } = await supabase()
    .from(TABLES.settings)
    .upsert({ id: SETTINGS_DOC_ID, document: settings });
  throwIfError(error);
  return settings;
}

export async function getSettingsByToken(token: string): Promise<Settings | null> {
  const settings = await getSettings();
  return settings.calendarToken === token ? settings : null;
}

export { newId, nowIso };

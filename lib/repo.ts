import { db, COLLECTIONS, SETTINGS_DOC_ID, nowIso, newId } from "./firestore";
import { DEFAULT_FOCUS_FACTOR, DEFAULT_MAX_NUDGES, DEFAULT_SIZE_MINUTES } from "./constants";
import type {
  Area, VisionItem, Goal, Task, Assignee, Metric, MetricReading, Day,
  CadenceRule, KnowledgeEntry, UserChat, Initiative, Settings,
} from "./types";

async function all<T>(collection: string): Promise<T[]> {
  const snap = await db().collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

async function one<T>(collection: string, id: string): Promise<T | null> {
  const doc = await db().collection(collection).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() } as T;
}

async function put<T extends { id: string }>(collection: string, item: T): Promise<T> {
  await db().collection(collection).doc(item.id).set(item, { merge: true });
  return item;
}

async function remove(collection: string, id: string): Promise<void> {
  await db().collection(collection).doc(id).delete();
}

// ---- Areas ----
export const listAreas = () => all<Area>(COLLECTIONS.areas);
export const getArea = (id: string) => one<Area>(COLLECTIONS.areas, id);
export const saveArea = (item: Area) => put(COLLECTIONS.areas, item);

// ---- Vision items ----
export const listVisionItems = () => all<VisionItem>(COLLECTIONS.visionItems);
export const getVisionItem = (id: string) => one<VisionItem>(COLLECTIONS.visionItems, id);
export const saveVisionItem = (item: VisionItem) => put(COLLECTIONS.visionItems, item);
export const deleteVisionItem = (id: string) => remove(COLLECTIONS.visionItems, id);

// ---- Goals ----
export const listGoals = () => all<Goal>(COLLECTIONS.goals);
export const getGoal = (id: string) => one<Goal>(COLLECTIONS.goals, id);
export const saveGoal = (item: Goal) => put(COLLECTIONS.goals, item);
export const deleteGoal = (id: string) => remove(COLLECTIONS.goals, id);

// ---- Tasks ----
export const listTasks = () => all<Task>(COLLECTIONS.tasks);
export const getTask = (id: string) => one<Task>(COLLECTIONS.tasks, id);
export const saveTask = (item: Task) => put(COLLECTIONS.tasks, item);
export const deleteTask = (id: string) => remove(COLLECTIONS.tasks, id);

// ---- Assignees ----
export const listAssignees = () => all<Assignee>(COLLECTIONS.assignees);
export const getAssignee = (id: string) => one<Assignee>(COLLECTIONS.assignees, id);
export const saveAssignee = (item: Assignee) => put(COLLECTIONS.assignees, item);

// ---- Metrics ----
export const listMetrics = () => all<Metric>(COLLECTIONS.metrics);
export const getMetric = (id: string) => one<Metric>(COLLECTIONS.metrics, id);
export const saveMetric = (item: Metric) => put(COLLECTIONS.metrics, item);

export async function listReadingsForMetric(metricId: string): Promise<MetricReading[]> {
  const snap = await db()
    .collection(COLLECTIONS.metricReadings)
    .where("metricId", "==", metricId)
    .orderBy("recordedAt", "asc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MetricReading);
}

export async function addMetricReading(metricId: string, value: number): Promise<MetricReading> {
  const reading: MetricReading = { id: newId("reading"), metricId, value, recordedAt: nowIso() };
  await db().collection(COLLECTIONS.metricReadings).doc(reading.id).set(reading);
  const metric = await getMetric(metricId);
  if (metric) {
    await saveMetric({ ...metric, currentValue: value, updatedAt: nowIso() });
  }
  return reading;
}

// ---- Days ----
export const getDay = (date: string) => one<Day>(COLLECTIONS.days, date);
export const saveDay = (item: Day) => put(COLLECTIONS.days, item);
export const listDays = () => all<Day>(COLLECTIONS.days);

// ---- Cadence rules ----
export const listCadenceRules = () => all<CadenceRule>(COLLECTIONS.cadenceRules);
export const getCadenceRule = (id: string) => one<CadenceRule>(COLLECTIONS.cadenceRules, id);
export const saveCadenceRule = (item: CadenceRule) => put(COLLECTIONS.cadenceRules, item);

// ---- Knowledge entries ----
export const listKnowledgeEntries = () => all<KnowledgeEntry>(COLLECTIONS.knowledgeEntries);
export const saveKnowledgeEntry = (item: KnowledgeEntry) => put(COLLECTIONS.knowledgeEntries, item);
export const deleteKnowledgeEntry = (id: string) => remove(COLLECTIONS.knowledgeEntries, id);

// ---- User chats ----
export const listUserChats = () => all<UserChat>(COLLECTIONS.userChats);
export const saveUserChat = (item: UserChat) => put(COLLECTIONS.userChats, item);

// ---- Initiatives ----
export const listInitiatives = () => all<Initiative>(COLLECTIONS.initiatives);
export const getInitiative = (id: string) => one<Initiative>(COLLECTIONS.initiatives, id);
export const saveInitiative = (item: Initiative) => put(COLLECTIONS.initiatives, item);

// ---- Settings (singleton) ----
export async function getSettings(): Promise<Settings> {
  const doc = await db().collection(COLLECTIONS.settings).doc(SETTINGS_DOC_ID).get();
  if (!doc.exists) {
    const defaults: Settings = {
      focusFactor: DEFAULT_FOCUS_FACTOR,
      sizeMinutes: DEFAULT_SIZE_MINUTES,
      calendarToken: newId("cal"),
      maxNudges: DEFAULT_MAX_NUDGES,
      recurringBlocks: [],
      workDayStartMinute: 540,
      workDayEndMinute: 1260,
    };
    await db().collection(COLLECTIONS.settings).doc(SETTINGS_DOC_ID).set(defaults);
    return defaults;
  }
  return doc.data() as Settings;
}

export async function saveSettings(settings: Settings): Promise<Settings> {
  await db().collection(COLLECTIONS.settings).doc(SETTINGS_DOC_ID).set(settings, { merge: true });
  return settings;
}

export async function getSettingsByToken(token: string): Promise<Settings | null> {
  const settings = await getSettings();
  return settings.calendarToken === token ? settings : null;
}

export { newId, nowIso };

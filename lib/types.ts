// Core data model — Personal PM System PRD §5

export type ID = string;

export interface Area {
  id: ID;
  name: string;
  colorToken: string;
  sortOrder: number;
  isCadenceOnly: boolean;
}

export type VisionStatus = "dormant" | "active";

export interface VisionItem {
  id: ID;
  areaId: ID;
  title: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  lastActivatedAt: string | null;
  status: VisionStatus;
  linkedGoalIds: ID[];
}

export type GoalStatus = "not_started" | "active" | "done" | "parked";

export interface Goal {
  id: ID;
  areaId: ID;
  initiativeId: ID | null;
  title: string;
  successDefinition: string;
  targetDate: string | null;
  priority: number; // 1-5
  status: GoalStatus;
  visionItemId: ID | null;
}

export type TaskType =
  | "build"
  | "delegated"
  | "assignment"
  | "learning"
  | "cadence"
  | "user_chat";

export type TaskSubtype = "issue" | "bug" | "feature" | null;

export type TaskSize = "S" | "M" | "L";

// Status pipelines per type (PRD §6)
export const STATUS_PIPELINES: Record<TaskType, string[]> = {
  build: ["triage", "specced", "in_progress", "shipped"],
  delegated: ["specced", "sent", "in_progress", "review", "accepted"],
  assignment: ["not_started", "in_progress", "submitted"],
  learning: ["backlog", "active", "artifact_produced"],
  cadence: ["scheduled", "done"],
  user_chat: ["scheduled", "completed", "logged"],
};

export interface Task {
  id: ID;
  areaId: ID;
  goalId: ID | null;
  initiativeId: ID | null;
  type: TaskType;
  subtype: TaskSubtype;
  title: string;
  definitionOfDone: string | null;
  size: TaskSize | null;
  estimateMinutes: number | null;
  actualMinutes: number | null;
  priority: number; // 1-5
  severity: number | null; // 1-4, bugs/issues only
  dueAt: string | null;
  scheduledAt: string | null;
  assigneeId: ID | null;
  status: string;
  createdAt: string;
  closedAt: string | null;
  lastTouchedAt: string;
  hypothesis: string | null;
  targetMetric: string | null;
  artifactDefinition: string | null;
  cadenceRuleId: ID | null;
  committedForDate: string | null; // date (YYYY-MM-DD) this task was locked into, if any
  droppedReason: string | null;
}

export type Reliability = "reliable" | "variable";

export interface Assignee {
  id: ID;
  name: string;
  reliability: Reliability;
  active: boolean;
}

export interface Metric {
  id: ID;
  areaId: ID;
  name: string;
  isNorthStar: boolean;
  parentMetricId: ID | null; // driver tree: north star has null, drivers point up to it
  currentValue: number;
  targetValue: number;
  unit: string;
  updatedAt: string;
}

export interface MetricReading {
  id: ID;
  metricId: ID;
  value: number;
  recordedAt: string;
}

export interface Day {
  id: ID; // date, YYYY-MM-DD
  date: string;
  lockedAt: string | null;
  committedTaskIds: ID[];
  availableMinutes: number;
  commitmentKeptPct: number | null;
  estimateAccuracyPct: number | null;
  notes: string;
  dismissedNudgeIds: ID[];
}

export interface CadenceRule {
  id: ID;
  areaId: ID;
  title: string;
  targetPerWeek: number;
  minPerWeek: number | null; // for range display, e.g. soccer 1-3
  currentWeekCount: number;
  weekOf: string; // YYYY-MM-DD of the Monday this count applies to
}

export type KnowledgeEntryType =
  | "decision"
  | "user_insight"
  | "framework"
  | "competitor";

export interface KnowledgeEntry {
  id: ID;
  type: KnowledgeEntryType;
  title: string;
  body: string;
  linkedGoalIds: ID[];
  linkedTaskIds: ID[];
  source: string | null;
  createdAt: string;
}

export interface UserChat {
  id: ID;
  participantLabel: string;
  scheduledAt: string;
  completed: boolean;
  notes: string;
  insightEntryIds: ID[];
}

export type InitiativeStatus =
  | "planning"
  | "running"
  | "handing_off"
  | "complete"
  | "parked";

export interface Initiative {
  id: ID;
  areaId: ID;
  title: string;
  planBody: string;
  status: InitiativeStatus;
  ownerId: ID | null;
  startedAt: string;
  targetDate: string | null;
  restartAt: string | null;
  outcomeNotes: OutcomeNote[];
  metricIds: ID[];
  goalIds: ID[];
}

export interface OutcomeNote {
  date: string;
  body: string;
}

export interface Settings {
  focusFactor: number; // default 0.6
  sizeMinutes: Record<TaskSize, number>; // S:30 M:90 L:180
  calendarToken: string;
  maxNudges: number; // default 3
  recurringBlocks: RecurringBlock[];
  // No inbound Apple Calendar read exists (§11 is export-only, no OAuth/CalDAV).
  // "Free calendar minutes" is therefore derived from this configured work
  // window minus recurring blocks and already-scheduled tasks for the day.
  workDayStartMinute: number; // default 540 = 9:00am
  workDayEndMinute: number; // default 1260 = 9:00pm
}

export interface RecurringBlock {
  id: ID;
  title: string;
  dayOfWeek: number; // 0-6, Sunday=0
  startMinute: number; // minutes from midnight
  endMinute: number;
}

export interface Nudge {
  id: string;
  trigger: string;
  message: string;
  severity: number; // higher = more urgent, drives ranking
  entityType: string;
  entityId: string;
}

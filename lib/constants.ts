import type { TaskSize } from "./types";

export const DEFAULT_SIZE_MINUTES: Record<TaskSize, number> = {
  S: 30,
  M: 90,
  L: 180,
};

export const DEFAULT_FOCUS_FACTOR = 0.6;
export const DEFAULT_MAX_NUDGES = 3;

export const SEED_AREAS = [
  { id: "leap-b2c", name: "Leap B2C", colorToken: "violet", sortOrder: 0, isCadenceOnly: false },
  { id: "leap-b2b", name: "Leap B2B", colorToken: "indigo", sortOrder: 1, isCadenceOnly: false },
  { id: "investor-relations", name: "Investor relations", colorToken: "ir", sortOrder: 2, isCadenceOnly: false },
  { id: "findi", name: "FinDi", colorToken: "slate", sortOrder: 3, isCadenceOnly: false },
  { id: "pm-recruiting", name: "PM recruiting", colorToken: "amber", sortOrder: 4, isCadenceOnly: false },
  { id: "personal-brand", name: "Personal brand", colorToken: "rose", sortOrder: 5, isCadenceOnly: false },
  { id: "campus", name: "Campus", colorToken: "teal", sortOrder: 6, isCadenceOnly: false },
  { id: "school", name: "School", colorToken: "blue", sortOrder: 7, isCadenceOnly: false },
  { id: "health-sport", name: "Health and sport", colorToken: "emerald", sortOrder: 8, isCadenceOnly: false },
  { id: "hobbies", name: "Hobbies", colorToken: "fuchsia", sortOrder: 9, isCadenceOnly: false },
] as const;

/** Short tooltip for FOCUS ON chips (life areas, not app roles). */
export const AREA_HINTS: Record<string, string> = {
  "investor-relations":
    "Fundraising: investor updates, meetings, deck, and data room—not the same as Admin logistics.",
};

export const AREA_COLOR_HEX: Record<string, string> = {
  violet: "#7c3aed",
  indigo: "#4f46e5",
  ir: "#4f57e8",
  slate: "#475569",
  amber: "#d97706",
  rose: "#e11d48",
  teal: "#0d9488",
  blue: "#2563eb",
  stone: "#78716c",
  emerald: "#059669",
  fuchsia: "#c026d3",
  cyan: "#0891b2",
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: "Crash or data loss",
  2: "Core loop broken",
  3: "Degraded",
  4: "Cosmetic",
};

export const TASK_TYPE_LABELS: Record<string, string> = {
  build: "Build",
  delegated: "Delegated",
  assignment: "Assignment",
  learning: "Learning",
  cadence: "Cadence",
  user_chat: "User chat",
};

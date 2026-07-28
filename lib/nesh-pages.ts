export type NeshViewId =
  | "today"
  | "weekly"
  | "goals"
  | "tasks"
  | "calendar"
  | "docs"
  | "vision"
  | "members"
  | "learning"
  | "initiatives"
  | "metrics"
  | "reviews-weekly"
  | "reviews-monthly"
  | "settings";

export const ROUTE_VIEW: { prefix: string; id: NeshViewId }[] = [
  { prefix: "/today", id: "today" },
  { prefix: "/weekly", id: "weekly" },
  { prefix: "/calendar", id: "weekly" },
  { prefix: "/goals", id: "goals" },
  { prefix: "/triage", id: "tasks" },
  { prefix: "/calendar", id: "calendar" },
  { prefix: "/knowledge", id: "docs" },
  { prefix: "/vision", id: "vision" },
  { prefix: "/delegated", id: "members" },
  { prefix: "/learning", id: "learning" },
  { prefix: "/initiatives", id: "initiatives" },
  { prefix: "/metrics", id: "metrics" },
  { prefix: "/reviews/weekly", id: "reviews-weekly" },
  { prefix: "/reviews/monthly", id: "reviews-monthly" },
  { prefix: "/settings", id: "settings" },
];

export function viewForPath(pathname: string): NeshViewId {
  const hit = ROUTE_VIEW.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  return hit?.id ?? "today";
}

export const VIEW_HEADINGS: Record<NeshViewId, [string, string]> = {
  today: ["Today", "Your committed plan for the day"],
  weekly: ["Weekly", "Your week — classes, tasks, and where things land"],
  goals: ["Goals", "In play this quarter — each with a definition of done"],
  tasks: ["Tasks", "Inbox and backlog — triage before it becomes real work"],
  calendar: ["Weekly", "Your week — classes, tasks, and where things land"],
  docs: ["Documents", "Decisions, frameworks, and reference by area"],
  vision: ["Vision", "The life you're building"],
  members: ["Delegated", "People you're waiting on — outside your capacity"],
  learning: ["Learning", "Backlog and active slots (max 2 active)"],
  initiatives: ["Initiatives", "Named plans with strategy and outcomes"],
  metrics: ["Metrics", "North stars and driver trees"],
  "reviews-weekly": ["Weekly review", "Friday pass — calibration and slips"],
  "reviews-monthly": ["Monthly review", "Vision, dormant items, trends"],
  settings: ["Settings", "Capacity, calendar feed, and defaults"],
};

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    _client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

/** Postgres table names (snake_case). */
export const TABLES = {
  areas: "areas",
  visionItems: "vision_items",
  goals: "goals",
  tasks: "tasks",
  assignees: "assignees",
  metrics: "metrics",
  metricReadings: "metric_readings",
  days: "days",
  cadenceRules: "cadence_rules",
  knowledgeEntries: "knowledge_entries",
  userChats: "user_chats",
  initiatives: "initiatives",
  settings: "settings",
} as const;

export const SETTINGS_DOC_ID = "singleton";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${prefix ? "-" : ""}${time}${rand}`;
}

export function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

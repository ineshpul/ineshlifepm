import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const tables = ["goal_progress_logs", "workspaces", "workspace_members", "workspace_invites", "areas"];

let failed = false;

async function main() {
  for (const t of tables) {
    const { error } = await sb.from(t).select("id").limit(1);
    if (error) {
      console.log(`${t}: MISSING — ${error.message}`);
      failed = true;
    } else {
      console.log(`${t}: ok`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

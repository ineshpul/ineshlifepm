# Personal PM System

A personal product-management system where your life is the product — built from the V1 PRD. Next.js on Vercel, **Supabase (Postgres)**, Apple Calendar via an ICS feed. Single user, no auth beyond what you optionally add.

## What's here

- Full data model: Areas, Vision items, Goals, Tasks (6 workflow types), Assignees, Metrics + readings, Days, Cadence rules, Knowledge entries, User chats, Initiatives (`lib/types.ts`)
- Priority scoring, time-based capacity, the morning-proposal mix constraints, commitment-kept / estimate-accuracy scoring, real-capacity rolling average (`lib/scoring.ts`)
- The nudge engine, capped at 3 on Today, never firing on Vision (`lib/nudges.ts`)
- RFC 5545 ICS calendar feed generation (`lib/ics.ts`), served at `GET /api/calendar/[token]`
- All 13 screens from PRD §9: Today, Goals, Vision, Calendar, Metrics, Triage, Learning, Delegated, Knowledge base, Initiatives (index + detail), plus Weekly/Monthly review and Settings
- Seed data from PRD §16 (`scripts/seed.ts`) — areas, assignees, cadence rules, and all named initiatives, parked where specified
- A small test suite (`test/scoring.test.ts`) covering the CRITICAL rules: severity/staleness scoring, the mix constraints, delegated work staying outside capacity, the 3-nudge cap, the Thursday-only cadence nudge, and ICS formatting

## Deviations from the PRD, and why

- **`GET /api/calendar/[token].ics`**: Next's App Router can't mix a literal suffix into a dynamic-segment folder name, so the route itself lives at `/api/calendar/[token]`. A rewrite in `next.config.ts` makes `/api/calendar/TOKEN.ics` work as a literal URL for Apple Calendar subscriptions, so nothing changes for you day to day.
- **"Free calendar minutes" (§7.2, §11)**: the PRD's own calendar integration is export-only (an ICS feed you publish out) — there's no described way to read *back* from Apple Calendar without CalDAV/OAuth, which §11 explicitly rules out. So `available_minutes` is derived from a configured work-day window (Settings → Capacity) minus your recurring blocks minus tasks already scheduled that day, rather than a live calendar read. This is called out in `lib/types.ts` on the `Settings` interface. If you want a truer read of your actual calendar, the natural next step is a CalDAV read against Apple's servers using app-specific credentials — out of scope here since the PRD ruled out OAuth-style integrations.
- **Metric driver trees (§9.5)**: the PRD's `Metric` schema had no parent/child relationship, but §9.5 asks for a north-star-plus-drivers tree. Added `parentMetricId` to `Metric` to make that real instead of just grouping by area.
- **Bug/issue "repro steps" and "observation" (§6.1)**: the schema has no dedicated field for these, so they're captured in `definitionOfDone` when a build item leaves triage. Functionally identical to a dedicated field, just reusing what's there.

## Local setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor** → run the migration in `supabase/migrations/001_initial.sql` (creates all tables + enables RLS).
3. **Project Settings → API** — copy **Project URL** and **service_role** key (not the anon key).
4. Copy `.env.example` to `.env.local` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Install and run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — it redirects to `/today`.

### 3. Seed data

Populates the areas, assignees, cadence rules, and all named initiatives from PRD §16 (Substack/X/TikTok plans parked until after Lollapalooza, IU outreach with its open incentive-question goal, the UIUC handoff owned by Ronin, Leap B2C retention, the B2B pipeline, and the three PM-recruiting initiatives). Safe to re-run — it upserts on stable ids rather than duplicating.

```bash
npm run seed
```

### 4. Tests and typecheck

```bash
npm run typecheck
npm test
```

## Deploying to Vercel (PowerShell)

You said you have the Vercel CLI available in PowerShell — here's the exact sequence. Run these from the repo root on your machine (not in this sandbox, which has no way to reach your terminal).

```powershell
# One-time: install the CLI if you haven't already
npm install -g vercel

# From the repo root
vercel login
vercel link          # creates/links a Vercel project for this repo

# Push Supabase env vars into the Vercel project
# (mark as Sensitive; paste each value when prompted)
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY

# First deploy
vercel --prod
```

After that, connect the Vercel project to this GitHub repo (`ineshpul/ineshlifepm`, branch `main`) from the Vercel dashboard, or via:

```powershell
vercel git connect
```

so every push redeploys automatically.

### After deploying

Run the seed script once against production data. Easiest path: pull the Vercel env vars locally and run it from your machine —

```powershell
vercel env pull .env.local
npm run seed
```

## Apple Calendar

Settings → Calendar feed shows your subscription URL: `https://<your-app>.vercel.app/api/calendar/<token>.ics`. In Apple Calendar: **File → New Calendar Subscription…**, paste the URL, set refresh to 15 minutes.

The URL is unauthenticated by necessity (calendar clients can't do OAuth) — anyone with it can read your task titles. Rotate it from Settings if it ever leaks. This is explicitly acceptable for single-user V1 per PRD §11 and would need revisiting before any multi-user version.

## Security note on dependencies

Run `npm audit` / `npm update` periodically for transitive advisories in Next and other deps. The app only uses Supabase on the server with the service role key — never ship that key to the browser.

## Out of scope for V1 (PRD §13)

Multi-user auth, AI goal decomposition, automatic metrics pull, RICE/ICE scoring, two-way issue-tracker sync, a native mobile app, monetization. See the PRD for the full list and the note in §15 about getting the FinDi IP assignment agreement reviewed before relying on this for work-adjacent discipline tracking.

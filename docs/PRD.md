# Personal PM System — PRD (V1)

**Working name:** TBD
**One line:** A personal product management system where your life is the product.
**Owner:** Single user (the builder)
**Status:** Draft for build, hand directly to Claude Code
**Target stack:** Next.js on Vercel, Firestore, Apple Calendar via ICS feed

---

## 0. How to read this document

This is written to be handed to a build agent. It is opinionated on purpose. Where a decision was made without confirmation it is marked **[ASSUMPTION]** so it can be challenged. Where something is load-bearing and should not be simplified away it is marked **[CRITICAL]**.

Build V1 completely before touching anything in section 13.

---

## 1. Problem

The user runs a startup, holds a second commitment, is in school, is recruiting for product roles, is building a public writing presence, and maintains personal goals in sport and fitness. These live in separate places or nowhere. The result is that whatever is loudest wins the day, and quieter areas go untouched for weeks without anyone noticing.

Existing tools do not solve this. Monday, Asana, Linear and Jira organize around projects owned by different people. The unit of scarcity here is different: it is one person's finite daily capacity, and every area of their life competes for it. No commercial tool models that, because the market for it is one person.

**The product is the user's life. This system is the PM tool for it.**

---

## 2. Principles

1. **Nothing gets worked that is not written down.** No exceptions.
2. **Vibes are not evidence.** Changes require an observation, a metric, or a repro.
3. **Dreams do not compete with bugs.** Aspirational content lives in a separate tier and never appears on the daily list.
4. **The daily list locks.** Once committed, it is closed. New input goes to triage.
5. **The score measures calibration, not volume.** Finishing three things you committed to beats finishing six of twelve.
6. **Extensive but calm.** Depth is available through navigation, never pushed onto the default screen.

---

## 3. Three-tier architecture [CRITICAL]

This separation is what keeps the system usable. Do not collapse it.

| Tier | Contains | Generates tasks | Reviewed |
|---|---|---|---|
| **Vision** | Long-term aspirations, life goals, Leap's long-term shape, hobbies | No | Monthly |
| **Active** | Goals in play this quarter, with defined steps | Yes | Weekly |
| **Today** | Committed work for the day | n/a | Daily |

Items move Vision → Active by explicit user action only. Nothing auto-promotes.

---

## 4. Areas

Fixed list, user-editable. Every object belongs to exactly one area.

| Area | Notes |
|---|---|
| Leap B2C | Consumer app, retention, product |
| Leap B2B | Pipeline, partnerships, schools and companies |
| FinDi | Employer commitments only. Deadlines and obligations. No product detail. |
| PM recruiting | Sub-threads: job applications, outreach, study with Brady |
| Personal brand | Substack, X, public writing |
| Campus | Student orgs, campus growth |
| School | Coursework, assignments |
| Admin | Study abroad application, logistics, misc |
| Health and sport | Gym, soccer |
| Hobbies | Football Manager, personal interests |
| Product knowledge base | Reference and decision log, see §9.9 |

**Initiatives** are the level between Area and Goal. An Initiative is a named plan with a written body: the IU outreach plan, the UIUC handoff, the Substack plan, the B2B pipeline build. It holds its own strategy, its own goals, its own metrics, and a record of how it went. See §5.11.

Hierarchy: **Area → Initiative → Goal → Task.** Initiative is optional; a task can hang off an area directly.

---

## 5. Data model

### 5.1 Area
```
id, name, color_token, sort_order, is_cadence_only (bool)
```

### 5.2 VisionItem
```
id, area_id, title, body (rich text), image_url (nullable),
created_at, last_activated_at (nullable), status (dormant | active)
linked_goal_ids []
```
Dormant items with no linked active goal for over 90 days are flagged in the monthly review only. **[CRITICAL]** Never surface this flag on Today.

### 5.3 Goal
```
id, area_id, initiative_id (nullable), title,
success_definition (text, required — numeric or testable),
target_date (nullable), priority (1-5),
status (not_started | active | done | parked),
vision_item_id (nullable)
```
A goal cannot be set to `active` without a `success_definition`. **[CRITICAL]** This is the forcing function for decomposition.

### 5.4 Task
```
id, area_id, goal_id (nullable), initiative_id (nullable),
type (build | delegated | assignment | learning | cadence | user_chat),
subtype (issue | bug | feature | null),
title, definition_of_done,
size (S | M | L), estimate_minutes, actual_minutes (nullable),
priority (1-5), severity (1-4, bugs and issues only),
due_at (nullable), scheduled_at (nullable),
assignee_id (nullable), status, created_at, closed_at,
last_touched_at,
hypothesis (nullable), target_metric (nullable),
artifact_definition (nullable, learning only)
```

**Size to minutes:** S = 30, M = 90, L = 180. User-editable in settings.

### 5.5 Assignee
```
id, name, reliability (reliable | variable), active (bool)
```
Seed with: Rohan, Ronin, Andre. User can add more.

### 5.6 Metric
```
id, area_id, name, is_north_star (bool),
current_value, target_value, unit, updated_at
```
```
MetricReading: id, metric_id, value, recorded_at
```

### 5.7 Day
```
id, date, locked_at (nullable),
committed_task_ids [], available_minutes,
commitment_kept_pct, estimate_accuracy_pct, notes
```

### 5.8 CadenceRule
```
id, area_id, title, target_per_week, current_week_count
```
Seed: gym 4/week, soccer 1-3/week (target 2, range display), Substack 2/week, X 14/week, TikTok 14/week, user chats 3/week.

### 5.9 KnowledgeEntry
```
id, type (decision | user_insight | framework | competitor),
title, body, linked_goal_ids [], linked_task_ids [],
source (nullable), created_at
```

### 5.10 UserChat
```
id, participant_label, scheduled_at, completed (bool),
notes, insight_entry_ids []
```

### 5.11 Initiative [CRITICAL]
```
id, area_id, title, plan_body (rich text),
status (planning | running | handing_off | complete | parked),
owner_id (nullable — an Assignee, used for handoffs),
started_at, target_date (nullable), restart_at (nullable, parked only),
outcome_notes, metric_ids [], goal_ids []
```

An Initiative is a plan you can read, not a tag. `plan_body` holds the written strategy. Goals hang off it, metrics attach to it, and `outcome_notes` is where you record how it actually went.

**Handoff:** when `status` is `handing_off`, `owner_id` is the person taking it over. The initiative stays visible with a reduced footprint and appears in every weekly review until it reaches `complete`. This is how the UIUC handoff is tracked.

**Parked:** `restart_at` sets a date. Parked initiatives generate no tasks and no nudges until that date passes.

---

## 6. Workflow types [CRITICAL]

One table, six behaviours. `type` drives the status pipeline and which fields render.

| Type | Status pipeline | Consumes capacity | Required fields |
|---|---|---|---|
| **build** | triage → specced → in progress → shipped | Yes | definition_of_done |
| **delegated** | specced → sent → in progress → review → accepted | **No** | assignee, definition_of_done |
| **assignment** | not started → in progress → submitted | Yes | due_at |
| **learning** | backlog → active → artifact produced | Yes | artifact_definition |
| **cadence** | recurring, resets weekly | Yes | cadence_rule_id |
| **user_chat** | scheduled → completed → logged | Yes | scheduled_at |

**Delegated work does not consume capacity.** **[CRITICAL]** It appears on Today in a separate "check on" lane, outside the commitment count. If it counted, the calibration score would be polluted by work the user is only waiting on.

### 6.1 Build subtypes

| Subtype | Required to leave triage | Sorted by |
|---|---|---|
| **bug** | repro steps, severity | severity, then priority |
| **issue** | observation, severity | severity, then priority |
| **feature** | hypothesis, target_metric | priority |

**Severity scale:** 1 = crash or data loss, 2 = core loop broken, 3 = degraded, 4 = cosmetic.

**A feature cannot leave triage without a hypothesis and a target metric.** **[CRITICAL]** This is the entire vibes filter. Hypothesis format:

> We believe [change] will cause [metric] to move [direction] because [reason]. We will know we are right if [threshold] within [timeframe].

---

## 7. Priority and the daily commit

### 7.1 Priority score

Priority orders the backlog. It does not decide the day.

```
score = (priority * 2)
      + deadline_pressure
      + staleness
      + severity_boost
```
- `deadline_pressure`: 0 if no due date, scaling to 5 as due_at approaches
- `staleness`: +1 per 7 days since last_touched_at, capped at 5
- `severity_boost`: (5 - severity) for bugs and issues, else 0

**Staleness is what stops quiet areas from starving.** School and Admin climb on their own without the user remembering them.

### 7.2 Capacity, time-based [CRITICAL]

The daily commit is bounded by available time, not by a task count.

```
available_minutes = (free calendar minutes today) * focus_factor
focus_factor default = 0.6, user-editable
```

Free calendar minutes come from the Apple Calendar read (see §11), minus recurring blocks. The morning proposal fills `available_minutes` with tasks by estimate, subject to the mix constraints below.

### 7.3 Mix constraints

Applied to the morning proposal. All overridable.

- Max 2 tasks from any one area
- At least 1 task whose staleness is above threshold
- At least 1 task from an area untouched for 3+ days
- Cadence items due this week are offered before optional work
- Delegated items appear as checks, outside the count and outside capacity

### 7.4 The lock

User confirms the morning list. `locked_at` is set and displayed. After the lock:
- The committed list cannot be added to
- Items can be marked done, or explicitly dropped with a reason
- New input goes to triage
- Anything closed today that was not on the committed list is logged but does not count toward the score

### 7.5 Nudges [CRITICAL — the cap is the feature]

This is the "keep reminding me" layer. It works only if it stays quiet.

**Maximum 3 nudges render on Today at any time.** Dismissible. Ranked by staleness severity. Everything that doesn't make the top 3 appears in the weekly review instead. No push notifications in V1.

| Trigger | Example message |
|---|---|
| Initiative untouched 10+ days | IU outreach plan hasn't moved in 12 days |
| Cadence behind pace by Thursday | Substack 0 of 2 this week |
| Delegated item stalled 7+ days | Andre's item has been in progress 9 days |
| Goal past target_date with no movement | Goal passed its date. Re-date it or park it. |
| Initiative in handing_off 21+ days | UIUC handoff still open |
| Learning active slot empty | One learning slot free |
| Metric not updated in 14 days | D7 retention last updated 18 days ago |

**Nudges never fire on Vision items and never appear on the Vision board.** **[CRITICAL]** Aspirations do not nag. Parked initiatives are silent until `restart_at`.

---

## 8. Scoring

### 8.1 Daily

```
commitment_kept = closed_committed / total_committed
estimate_accuracy = 1 - abs(actual_minutes - estimate_minutes) / estimate_minutes
```

`commitment_kept` is the headline number. `estimate_accuracy` is shown beside it.

Shown as context, not folded into the score:
- **Ladder rate:** share of closed tasks attached to a goal
- **Spread:** number of distinct areas touched

**Framing rule [CRITICAL]:** the score is a calibration signal, not a verdict. A 3 of 3 day must read better than a 6 of 12 day, and the UI copy should say so. Never render a low score in red or with negative language. It means the morning estimate was wrong, which is information.

### 8.2 Derived: real capacity

```
real_capacity = rolling 14-day average of closed committed tasks per day
real_minutes = rolling 14-day average of actual_minutes closed per day
```

Displayed on Today. When the user commits past `real_minutes`, show a non-blocking warning with the actual number. **This is the single highest-value feature in the product.**

### 8.3 Progress, three axes

1. **Goal completion:** closed steps / total steps, per goal
2. **Metric trend:** MetricReading sparkline against target
3. **Calibration trend:** commitment_kept over 14, 30, 90 days

Streaks are deliberately excluded.

---

## 9. Screens

### 9.1 Today (default route)
Left nav, main column. Contents:
- Date, committed count, lock state and timestamp
- Committed task list: checkbox, title, goal, size, scheduled time, area tag
- "Check on" lane: delegated items awaiting response
- Cadence strip: gym 2/4, soccer 1/2, Substack 0/1, user chats 1/3 this week
- Triage count with quick-add
- Three metric cards: calibration 14d, one pinned north star, real capacity

### 9.2 Goals
Board grouped by area. Each row: title, progress bar, target date, priority, sub-thread tag. Expand for steps, linked vision item, linked metric, delegated items.

### 9.3 Vision board
Expressive, colorful, modern. Card grid, image plus statement per card, grouped by area. Dormant cards visually recede rather than being flagged in red. Clicking a card shows linked active goals or an empty state inviting promotion to Active.

**This is the only screen where the visual language is expressive.** Everywhere else, colour carries area identity only.

### 9.4 Calendar
Week view. Recurring blocks render as background. Committed tasks placed at `scheduled_at`. Proposed times render in a lighter state until confirmed. Drag to reschedule.

### 9.5 Metrics
Per area: north star plus input drivers, as a tree. Leap B2C and Leap B2B are separate trees. Manual reading entry. Sparkline per metric.

### 9.6 Triage
Single stack, cleared weekly. Per item: assign to goal, send to backlog, delegate, or delete. Build items must satisfy their subtype requirements (§6.1) before leaving triage.

### 9.7 Learning
Two panes. Backlog is unbounded. Active is capped at 2 items. **[CRITICAL]** Every item has an `artifact_definition` and closes only when the artifact exists.

### 9.8 Delegated
Grouped by assignee. Shows status, days since last movement, and acceptance criteria. Auto-generates scope-of-work text for copy-paste:

> **Context:** [2 sentences]
> **Deliverable:** [artifact]
> **Acceptance criteria:** [testable list]
> **Out of scope:** [explicit list]
> **Due:** [date]

**[ASSUMPTION]** Assignees marked `variable` get a warning when assigned a task that blocks a goal with a target date inside 14 days.

### 9.9 Product knowledge base
**[ASSUMPTION]** Interpreted as a reference and decision log. Four entry types: decision, user insight, framework, competitor. Entries link to goals and tasks. User chat notes flow into it as user insights. Searchable.

### 9.10 Initiative detail
The screen where a plan actually lives.

- Header: title, area, status, owner, target date
- **The plan**, editable rich text. This is the strategy in your own words.
- Linked goals with progress bars
- Linked metrics with sparklines
- **How it's going:** outcome notes, appended over time, dated
- Activity timeline: what closed and when
- Handoff panel when status is `handing_off`: who has it, what has transferred, what remains

### 9.11 Initiatives index
All initiatives grouped by area. Status, owner, days since last movement, goal progress. This is the "what plans do I have running" view.

---

## 10. Reviews

**Weekly (Friday, 30 min):** what closed, what slipped, what was added mid-week and why, calibration for the week, areas untouched, cadence completion, triage clear.

**Monthly:** vision board pass, dormant items surfaced, goals promoted or parked, metric trends over 30 days.

---

## 11. Calendar integration

Apple Calendar. No Google API, no OAuth.

**Endpoint:** `GET /api/calendar/[token].ics` returns `text/calendar`.

Serves three uses with one implementation: one-time download and import, live subscription, and read-back by the app.

Requirements:
- Long random token per user, rotatable from settings
- `Last-Modified` header set correctly
- Strip events older than 30 days to keep the file small
- Standard RFC 5545 formatting
- Events: committed tasks with `scheduled_at`, items with `due_at`, recurring blocks

Apple Calendar refresh is user-set to 15 minutes, which is close enough to live.

**[CRITICAL] Security note:** the feed URL is necessarily unauthenticated, because calendar clients cannot do OAuth. Anyone with the URL can read every task title. Acceptable for single-user. Must be revisited before any multi-user version.

---

## 12. Visual design

- Working views: quiet. White surfaces, hairline borders, generous whitespace. Colour used only as area identity.
- Vision board: expressive, colourful, modern. This is the deliberate contrast.
- Dark and light mode, following system.
- Sentence case throughout.
- Never render the calibration score in a negative colour.

---

## 13. Out of scope for V1

- Multi-user, auth beyond the single user, invite codes
- AI goal decomposition
- Firestore-to-metrics automatic pull (manual metric entry in V1)
- RICE or ICE scoring
- Two-way sync with any external issue tracker
- Mobile app (responsive web only)
- Any monetisation

---

## 14. V1 acceptance criteria

1. Can create areas, goals with success definitions, and tasks of all six types
2. A goal cannot be activated without a success definition
3. A feature cannot leave triage without a hypothesis and target metric
4. Morning proposal fills available time subject to mix constraints
5. The day locks, and post-lock additions route to triage
6. Daily score computes commitment kept and estimate accuracy
7. Real capacity displays and warns on overcommit
8. Vision board renders, links to goals, and never appears on Today
9. ICS endpoint returns a valid feed that Apple Calendar subscribes to
10. Weekly and monthly review screens render their required data
11. Delegated items are excluded from capacity and the score
12. Learning active pane hard-caps at 2
13. Initiatives can be created with a written plan body, hold goals and metrics, and be handed off to an assignee
14. Parked initiatives generate no tasks and no nudges until `restart_at`
15. The nudge engine renders at most 3 items on Today and never fires on Vision items
16. The weekly review lists every undismissed nudge, not just the top 3

---

## 15. Open item, outside the build

An employment IP assignment agreement with FinDi covers work relating to personal discipline and finance. This product is a personal discipline tool created during that employment. Get the agreement reviewed by an attorney before building. This is not legal advice and this document does not resolve it.

---

## 16. Seed data

Create these at setup so the system is populated on day one rather than being an empty shell.

### 16.1 Personal brand

**Substack plan** — target 2 posts per week. Work through a topic bank by end of semester. Bank currently holds:
- Attention as the scarce contested good under something like UBI. Closest piece to Leap's long-term vision.
- The AI-relationship experiment: does building a personal relationship with an AI change output quality. Arms: human-like tone, negative reinforcement, task-oriented and specific.
- China markets, drawing on the KWEB versus KBA work.
- AI engineering and multi-agent architecture, drawing on the agent pipeline build.
- The Leap scaling journey, told with the full vision in mind.
- Philosophical and self-transparent pieces.

Constraint on the whole initiative: no strong public political positioning, for recruiting reasons.

**X plan** — 2 posts per day, questions count. 1 to 2 higher-quality posts per week. Niche: AI, tech, financial markets, Leap, philosophy.

**TikTok and Instagram plan** — 2 TikToks per day. Positioning narrowed to AI plus Leap only: how a builder with a business background reads the AI market and makes decisions from it. Same posts to Instagram on the Leap account.

**[ASSUMPTION]** These three are currently parked until after Lollapalooza. Set `status: parked` with a `restart_at` date so they stay silent until then, then wake up on their own.

### 16.2 Campus

**IU outreach plan** — recruit student organizations, arts and media school in particular, for marketing video work and social media. Currently working with 101 Stem Consulting. Crimson Consulting is the target.

Open problem, and it should be a **goal** with a success definition rather than a note: what is the incentive for orgs and students to work on Leap? Nothing else in this initiative moves reliably until that is answered.

**UIUC outreach handoff** — same play run at UIUC. Owner: Ronin. Status `handing_off` until Ronin is running it without input. Track what has transferred and what remains in the handoff panel.

### 16.3 Leap B2C
**Retention** — north star and driver tree, TakeTheLeapGate experiment readout, 28-day challenge calendar. This is the initiative that matters most; everything else in the area is subordinate to it.

### 16.4 Leap B2B
**Pipeline build** — stages with written entry and exit criteria.

### 16.5 PM recruiting
Three initiatives: **applications**, **outreach**, **study with Brady**.

### 16.6 Cadence rules
gym 4/week · soccer 2/week (range 1-3) · Substack 2/week · X 14/week · TikTok 14/week · user chats 3/week

### 16.7 Assignees
Rohan · Ronin (UIUC) · Andre

# Inesh Life PM (nesh)

> Product management — but for my life.

Personal PM system where your life is the product: areas, goals, tasks, metrics, initiatives, knowledge base, and daily planning. Built as **nesh** — Next.js + Supabase, deployed on Vercel.

**This is not [Leap](https://taketheleap.app).** Leap lives in [`leap-mvp`](https://github.com/ineshpul/leap-mvp).

[![Live demo](https://img.shields.io/badge/Live-ineshlifepm.vercel.app-111?style=for-the-badge)](https://ineshlifepm.vercel.app)
[![Leap repo](https://img.shields.io/badge/Leap-leap--mvp-2d6a2d?style=for-the-badge)](https://github.com/ineshpul/leap-mvp)

---

## At a glance

| | |
|---|---|
| **Role** | Solo PM + builder |
| **Problem** | PM frameworks are built for teams — not for running your own life as a product |
| **Users** | Personal use — I plan my own week in it |
| **Outcome** | V1 is live: a daily planning loop, capacity-aware scoring, and the full screen set from Today through Settings |
| **Stack** | Next.js 15 · Supabase · Tailwind · Vercel |

---

## PM highlights

- **PRD-driven V1** — Today, Weekly, Goals, Triage, Calendar, Vision, Learning, Delegated, Knowledge, Initiatives, Metrics, weekly and monthly reviews, Settings
- **Scoring engine** — priority, capacity, morning proposal mix constraints, commitment-kept scoring
- **Nudge engine** — Today shows at most three nudges (stale initiatives, cadence slips, capacity). Vision items never fire one
- **nesh workspace** — sectors, goals, weekly overview, team invites, life plan apply flow
- **Knowledge + areas** — area journal, knowledge upload, pulse reminders, technical board

---

## What I owned

- [x] Problem framing & PRD (life as product) — [`docs/PRD.md`](docs/PRD.md)
- [x] Data model & Supabase schema — [`supabase/migrations`](supabase/migrations)
- [x] UX flows across all V1 screens
- [x] Scoring / nudge business logic — [`lib/scoring.ts`](lib/scoring.ts), [`lib/nudges.ts`](lib/nudges.ts)
- [x] Build, seed scripts, and iteration — [`scripts/seed.ts`](scripts/seed.ts)

---

## Local setup

```bash
npm install
cp .env.example .env.local   # add Supabase keys
npm run dev
```

Schema lives in `supabase/migrations`. Seed with `npx tsx scripts/seed.ts` after the env file is in place. Product rules are in [`docs/PRD.md`](docs/PRD.md).

---

## Links

- **Live:** https://ineshlifepm.vercel.app
- **Leap (separate product):** https://taketheleap.app
- **LinkedIn:** https://www.linkedin.com/in/ineshpulugurtha/

---

## Repo note

GitHub `ineshlifepm` briefly pointed at Leap code by mistake. This repo is **Life PM only**. Leap history lives in **`leap-mvp`**.

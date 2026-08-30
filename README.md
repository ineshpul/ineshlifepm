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
| **Users** | Me (dogfooding) · [YOUR OTHER USERS IF ANY] |
| **Outcome** | [YOUR METRICS — e.g. daily planning loop, areas tracked, shipped V1 screens] |
| **Stack** | Next.js 15 · Supabase · Tailwind · Vercel |

---

## PM highlights

- **PRD-driven V1** — 13 screens: Today, Goals, Vision, Calendar, Metrics, Triage, Learning, Delegated, Knowledge, Initiatives, reviews, Settings
- **Scoring engine** — priority, capacity, morning proposal mix constraints, commitment-kept scoring
- **nesh workspace** — sectors, goals, weekly overview, team invites, life plan apply flow
- **Knowledge + areas** — area journal, knowledge upload, pulse reminders, technical board
- [YOUR AI PM ANGLE — e.g. morning proposal logic, nudge engine design, plan automation]

---

## What I owned

- [ ] Problem framing & PRD (life as product)
- [ ] Data model & Supabase schema
- [ ] UX flows across all V1 screens
- [ ] Scoring / nudge business logic
- [ ] Build, seed scripts, and iteration

---

## Local setup

```bash
npm install
cp .env.example .env.local   # add Supabase keys
npm run dev
```

See the project README in the repo root for full local setup (Supabase migration, seed, env vars).

---

## Links

- **Live:** https://ineshlifepm.vercel.app
- **Leap (separate product):** https://taketheleap.app
- **LinkedIn:** https://www.linkedin.com/in/ineshpulugurtha/

---

## Repo note

GitHub `ineshlifepm` briefly pointed at Leap code by mistake. This repo is **Life PM only**. Leap history lives in **`leap-mvp`**.

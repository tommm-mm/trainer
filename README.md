# Trainer

Single-user AI personal trainer. Next.js (App Router) + Supabase + Vercel + Claude API.
Principle: **automate the plumbing, never the judgment**. AI plans stay `proposed` until you approve them in the UI.

## Build status

| Step | Scope | Status |
|---|---|---|
| 1 | Scaffold, Supabase auth, login | ✅ |
| 2 | Week View, Log Workout, Goal Overview, seed goal | ✅ |
| A | London region, Garmin sync via intervals.icu, auto-tick plans, post-workout feedback | ✅ |
| B | Check-in + Analytics (volume, long-run share, ACWR, monotony, HR trend) | ✅ |
| C | Stub `/api/generate-week` + "Generate my week" | ⏳ |
| D | Real Claude call + goal-type branching + flags | ⏳ |
| E | Scheduled AI draft (Vercel Cron, 2x/week) | ⏳ |
| F | PWA install on phone | ⏳ |

## Garmin sync

Garmin Connect → intervals.icu (their side) → `POST /api/sync` → `activities`.

- Runs automatically when the Week View opens (at most every 10 min) and on the "↻ Garmin" button.
- Window: last 30 days on first sync, then from the latest synced day − 3 days. Idempotent (unique `user_id, external_id`).
- Runs / trail / virtual / treadmill → `run`; weight training → `gym`; other sports are skipped.
- Same-day `approved`/`edited` plan of the same kind → `completed`. `proposed` plans are never touched.
- Same-day manual gym logs → `garmin_confirmed = true`.
- Each synced workout shows a feedback card (feeling, RPE, notes). "Pain" creates a `pain_reported` flag.

## Metrics (`src/lib/metrics.ts`)

Pure functions, unit-tested (`npm test`), shared by the Stats page and the AI coach.

| Metric | Formula |
|---|---|
| Session load (sRPE) | `duration_min × RPE` (AU). Missing RPE → runs: `15 × HRR − 6` from avg HR; gym/other: your median RPE for the type; else 5 |
| HR reserve (HRR) | `(avg HR − rest) / (max − rest)`. Rest = Garmin 30-day median (fallback 46); max = max(195, intervals.icu setting, highest HR seen) |
| ACWR | `7-day load / (28-day load / 4)`, daily; null until 28 days of history. Safe band 0.8–1.3 |
| Monotony / strain | `mean daily load / SD` per ISO week (rest days = 0); strain = `weekly load × monotony` |
| Long-run share | `longest run / weekly run km`; guideline 30–35% |
| Easy runs | RPE ≤ 4, or unrated with HRR ≤ 75% |
| Efficiency Factor | `speed (m/min) / avg HR` on easy runs, also shown as pace at 65% HRR |

History: the Stats page offers a one-time 120-day Garmin import while there are < 12 weeks of activities.

## Structure

```
src/
  proxy.ts                  # Next 16 "proxy" (formerly middleware): session refresh + auth gate
  lib/supabase/client.ts    # browser client
  lib/supabase/server.ts    # server client (Server Components / Actions)
  lib/supabase/proxy.ts     # updateSession() used by src/proxy.ts
  lib/database.types.ts     # types generated from the live schema
  lib/dates.ts              # YYYY-MM-DD helpers, "today" in Europe/Rome
  lib/domain.ts             # goal types/statuses/phases, params shapes, Padova seed
  lib/sessions.ts           # suggested session types + run/gym classifier
  lib/form.ts               # FormData parsing for Server Actions
  lib/metrics.ts            # training-load metrics (pure, tested)
  app/checkin/              # daily check-in + body metrics, editable history
  app/analytics/            # Stats: charts (Recharts) over metrics.ts
  app/login/                # email/password sign-in (no signup)
  app/page.tsx              # Week View (plans, logs, flags, approve/edit/complete)
  app/week/                 # Week View actions + client components
  app/log/                  # Log Workout (run → activities, gym → gym_sessions)
  app/goal/                 # Goal Overview (active goal, new goal, history)
  components/               # bottom nav + page shell, status chip, shared classes
```

## How the screens use the data

- **Week View** — `weekly_plans` for the selected Monday (`?week=YYYY-MM-DD`) plus that week's `activities` / `gym_sessions` and unresolved `flags`. Status changes (approve, edit → `edited`, done → `completed`) only happen on a tap. Manually added sessions start as `approved`.
- **Log Workout** — `?plan=<id>` prefills from the planned session and can mark it completed. Runs get `avg_pace` computed; gym rows get `garmin_confirmed` if a same-day Garmin strength activity exists.
- **Goal** — one active goal at a time (enforced in app code). With no goals yet, a one-tap card creates the Padova Marathon goal from the brief.

## Local dev

```bash
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Env vars

| Name | Where | Phase |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel (set) | 1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel (set) | 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, server only | E |
| `INTERVALS_ICU_API_KEY` | Vercel, server only | A |
| `INTERVALS_ICU_ATHLETE_ID` | optional, defaults to `i726906` | A |
| `ANTHROPIC_API_KEY` | Vercel, server only | D |

## Account (single user)

There is no signup page. Create the one account in Supabase:
Authentication → Users → **Add user** (email + password, *Auto Confirm User* on).
Then Authentication → Sign In / Providers → turn off **Allow new users to sign up**.

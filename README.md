# Trainer

Single-user AI personal trainer. Next.js (App Router) + Supabase + Vercel + Claude API.
Principle: **automate the plumbing, never the judgment**. AI plans stay `proposed` until you approve them in the UI.

## Build status

| Phase | Scope | Status |
|---|---|---|
| 1 | Scaffold, Supabase auth, login | ✅ |
| 2 | Week View, Log Workout, Goal Overview, seed goal | ✅ |
| 3 | Check-in, Analytics | ⏳ |
| 4 | Stub `/api/generate-week` | ⏳ |
| 5 | intervals.icu sync | ⏳ |
| 6 | Real Claude call + flags | ⏳ |
| 7 | Vercel Cron (2x/week) | ⏳ |
| 8 | PWA manifest/icons | ⏳ |

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
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, server only | 5 |
| `INTERVALS_ICU_API_KEY` | Vercel, server only | 5 |
| `ANTHROPIC_API_KEY` | Vercel, server only | 6 |

## Account (single user)

There is no signup page. Create the one account in Supabase:
Authentication → Users → **Add user** (email + password, *Auto Confirm User* on).
Then Authentication → Sign In / Providers → turn off **Allow new users to sign up**.

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
| G | Gym logger, template editor, gym Stats, Today card, live meters, auto-refresh | ✅ |
| C1 | Season model: goal → season → blocks → weekly targets, versioned proposals, guardrails, Season page | 🔍 review |
| W | Garmin wellness sync (VO₂max, HRV, resting HR, sleep, CTL/ATL) → Stats › Fitness | ⏳ |
| C2 | Week generator: season targets + days you can train → proposed sessions | ⏳ |
| D0 | Coach inbox: Cowork / Claude API write proposals through the season contract | 🟡 via SQL + brief; dedicated inbox ⏳ |
| C | Stub `/api/generate-week` + "Generate my week" | ⏳ → C2 |
| D | Real Claude call + goal-type branching + flags | ⏳ |
| E | Scheduled AI draft (Vercel Cron, 2x/week) | ⏳ |
| F | PWA install on phone | ⏳ |

## Garmin sync

Garmin Connect → intervals.icu (their side) → `POST /api/sync` → `activities`.

- Runs automatically when the Week View opens (at most every 10 min) and on the "↻ Garmin" button.
- Window: last 30 days on first sync, then from the latest synced day − 3 days. Idempotent (unique `user_id, external_id`).
- Runs / trail / virtual / treadmill → `run`; `WeightTraining` → `gym`; `Workout` / `HIIT` / `Crossfit` → `cardio` (HIIT finishers: count in load, not as gym sessions) unless the Garmin name says strength ("Pesi"); rides (incl. indoor / exercise bike), swims, rowing, elliptical → `cross` (easy aerobic time: counts in load with an HR-based RPE, never in run km). The raw type is kept in `activities.sport_type`. Other sports are skipped.
- Same-day `approved`/`edited` plan of the same kind → `completed`. `proposed` plans are never touched.
- Same-day manual gym logs → `garmin_confirmed = true`.
- Completed gym workouts → linked to the longest same-day `gym` activity (`workouts.activity_id`); the session RPE is copied onto it.
- Each synced workout shows a feedback card (feeling, RPE, notes). "Pain" creates a `pain_reported` flag.

## Gym logger (`/gym`)

Schema: `exercises` (starter library with `user_id` NULL + your own), `workout_templates` → `template_exercises` (sets × rep range @ RIR, `main`/`finisher` block), `workouts` → `workout_exercises` → `workout_sets`. `exercise_targets` holds per-week overrides for Phase C (engine writes `proposed`, you approve). Migration: `supabase/migrations/20260929120000_gym_logger.sql`.

- **Local-first:** the in-progress workout lives in `localStorage`; every edit bumps a revision and is pushed as idempotent upserts on client-generated UUIDs (`src/lib/gym/push.ts`). Offline edits retry on reconnect and every 10 s; deletes are tombstoned until confirmed. Logic is pure and tested in `src/lib/gym/workout.ts`.
- **Prefill:** previous set today → last time's first working set → template target.
- **Finish:** session RPE → linked Garmin activity's `rpe` (so it counts in sRPE load once) and its feedback card is answered.
- Opening `/gym` needs signal once (no service worker until Phase F); after that the workout runs offline.
- **Templates** (`/gym/templates`): sets × rep range @ RIR, rest, main/finisher per exercise. Week View gym plans can point at one (Start workout); finishing completes the plan.
- **Live:** `LiveRefresh` (in `PageShell`) listens to Supabase Realtime on `activities`, `weekly_plans`, `exercise_targets`, `checkins` and finished `workouts`, and refreshes the screen; muscle meters in the logger include the workout in progress.
- **Today card** (Week View): rule-based suggestion (`src/lib/gym/today.ts`: plan first, next template in rotation, 48 h between full-body sessions) until the AI coach plans the week.

## Strength metrics (`src/lib/strength.ts`)

| Metric | Formula / source |
|---|---|
| e1RM | RIR-adjusted Epley: `weight × (1 + (reps + RIR)/30)`; only reps + RIR ≤ 12; unrated RIR = 0 (lower bound). Trend per lift = least-squares slope, % of level per week |
| Hard sets / muscle | Main-block working sets at RIR ≤ 4; primary ×1, secondary ×0.5. Reference 10–20/week (Schoenfeld 2017; Pelland 2024); ≈⅓ maintains (Bickel 2011). Calves and core not judged |
| Tonnage | Σ weight × reps of working sets (bodyweight: added load) |
| PRs | Session best e1RM or heaviest working weight beating all earlier sessions |
| Adherence | Prescribed main-block working sets done (capped per exercise); share of rated sets within ±1 RIR of target |
| Load | Unlinked workouts count as `duration × session RPE`; linked ones only via their Garmin activity |

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
  app/gym/                  # Gym logger (templates, live sets, rest timer, finish)
  lib/gym/                  # workout state machine, sync push, Garmin link (pure + tested)
  app/log/                  # Log a run manually (linked from /gym)
  app/goal/                 # Goal settings (active goal, new goal, history), under the Season tab
  app/season/               # Season page: proposal review, chart, races, efforts, blocks
  lib/season/               # season model, guardrails, diff, progress, efforts (pure + tested), drafts
  components/               # bottom nav + page shell, status chip, target meters, shared classes
```

## Season model (`/season`, `src/lib/season/`)

Goal → **season** (macrocycle, versioned) → **mesocycles** (blocks of 1–8 weeks, usually 3–6) → **season_weeks** (targets per ISO week). Migration: `supabase/migrations/20261001090000_season_model.sql`.

- **Goal-agnostic.** A block has a periodization `focus` (base, build, specific, peak, taper, recovery, transition) and a `gym_focus` (hypertrophy, strength, power, maintenance, off). Every week carries run targets (km, long run, runs, quality sessions) and gym sessions; either side can be empty. A strength goal is gym-led, a marathon run-led, a general-fitness season fills the gaps between goals.
- **One write contract.** Every coach (Claude Code today, the Claude API and Cowork later) writes a `SeasonDraft` JSON. `validateSeasonDraft()` blocks structural errors (Mondays, contiguous weeks, ranges, past weeks unchanged), then `create_season_proposal(goal, draft)` inserts it atomically as the next **`proposed`** version.
- **Approval.** Nothing applies until you tap Approve: `approve_season()` swaps versions in one transaction (old `approved` → `superseded`). Reject keeps the current plan. Your own week edits apply directly; past weeks can't change.
- **Guardrails** (warn, never block), run on every proposal:

| Check | Rule |
|---|---|
| Ramp | Build week ≤ +10% over the highest of the last 3 build weeks (steps ≤ 3 km always pass) |
| Lighter weeks | A deload / taper / recovery week at least every 5th week (3:1 or 4:1 loading) |
| Projected ACWR | Planned km ÷ mean of the 4 weeks before (actuals before the season) ≤ 1.3 |
| Long-run share | ≤ 50% of the week at plan level (a 30 km long run at 60 km is ~50%; Stats keeps the 30–35% everyday guide) |
| Your caps | `limits`: max runs/week, max week km, max long run, max gym/week |
| Race week | The last week contains the goal date |

Race weeks (goal and tune-ups) skip ramp, share and cap checks.
- **Progress.** Done work per week: run km, runs, longest run and gym days (Garmin strength or finished workouts; HIIT doesn't count). ±6% of the km target is on target: a week is judged on totals, not on which day a run happened.
- **Efforts.** HR bands as % of heart-rate reserve on your Garmin anchors (recovery < 65%, easy 65–75%, MP 75–84%, threshold 84–90%, intervals 90–97%); paces offset from goal marathon pace (Daniels VDOT tables). Tests in the plan replace the pace targets.
- **Races.** The goal race is A; tune-ups live in `goals.params.tune_up_races` with priority B/C and distance, added from the Season page. Tests inside the plan (time trials) are week `milestone`s.
- **Week View** shows the approved season's targets for the week with progress meters.
- **Cross-training.** Weeks carry `cross_sessions` (easy bike / swim for recovery); Garmin rides and swims sync as `cross` and fill that meter. They add load, never run km.
- **Weekly coaching loop.** The Cowork PT follows `docs/coach/pt-brief.md`: once a week it reads the data through the Supabase connector, reviews the week, and writes next week as `proposed` `weekly_plans` rows (and, when the plan itself should change, a season proposal via `create_season_proposal`, which takes the owner from the goal so a service-role writer works). Tommaso approves both in the app.

## How the screens use the data

- **Week View** — `weekly_plans` for the selected Monday (`?week=YYYY-MM-DD`) plus that week's `activities` / `gym_sessions` and unresolved `flags`. Status changes (approve, edit → `edited`, done → `completed`) only happen on a tap. Manually added sessions start as `approved`.
- **Log Workout** — `?plan=<id>` prefills from the planned session and can mark it completed. Runs get `avg_pace` computed; gym rows get `garmin_confirmed` if a same-day Garmin strength activity exists.
- **Goal** — one active goal at a time (enforced in app code). With no goals yet, a one-tap card creates the Padova Marathon goal from the brief. Periodization lives on the Season page (the old manual phase / build week / deload fields are no longer written).
- **Season** — the approved season and the open proposal for the active goal, with done work since the season start. With no season yet, a starter draft for the goal (Padova 2027) can be loaded as a proposal.

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

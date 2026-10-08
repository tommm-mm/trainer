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
| C1 | Season model for any goal: goal → season → blocks → weekly targets, versioned proposals, guardrails, Season page, cross-training | ✅ |
| Coach | Cowork PT: instructions, weekly review, writes `proposed` sessions / season versions via the Supabase connector (`docs/coach/`) | ✅ |
| L | Load = volume × intensity: planned weekly load (sRPE) per season week, load-based guardrails, load by type on Season + Week View, time in HR zones (80/20 check), SQL views for Cowork | ✅ |
| C2b | Gym progression suggestions in the logger (double progression at RIR → sets × reps @ RIR + add / same / lower weight; you accept and pick the kilos) | ✅ |
| C2a | Week checks: spacing & safety rules on the Week View (warn only, red = safety, amber = rest) | ✅ |
| C2c | Gym block periodization in the logger: deload (any block), +1 set / last set to RIR 0 (hypertrophy blocks), from the approved season | ✅ |
| C2c+ | Coach gym tools: templates tagged by block (the Gym tab and Today card use the current block's), new exercises, per-week rules (sets / RIR / rep range / weight direction by exercise group) replacing the default block rules. The coach designs the program (Build templates: Cowork, in November) | ✅ tools · ⏳ templates (coach) |
| C2d | Gym questions on the Week View: upper-body volume gaps (< 10 hard sets/week in hypertrophy blocks) and stalled lifts (4 sessions, ≥ 3 weeks) → add / swap an exercise, only on Yes | ✅ |
| Q | Quick check-in on the Week View (calves 0–3 + one niggle area, 10 s, until today has one); calves ≥ 2 or a niggle opens a `niggle` flag; views `weekly_muscle_sets`, `easy_runs` for Cowork | ✅ |
| C2e | Week generator from season targets + free days (with D1) | ⏳ |
| D0 | Coach inbox (`coach_proposals`): Cowork can propose any change (move / change / cancel a session, add / swap / change / remove a template exercise, new or archived templates), approved on the Week View, applied atomically by `apply_coach_proposal` | ✅ (restricted DB role for coaches: later) |
| W | Garmin wellness sync (VO₂max, HRV, resting HR, sleep, CTL/ATL) → Stats › Fitness | ⏳ |
| D1 | AI planner (Claude API): season, blocks and weekly plan with reasons; Regenerate with a reason | ⏳ |
| D2 | Flexible week (sessions by priority, reshuffle when life happens) + weekly coach review with memory | ⏳ |
| E | Automatic Sunday plan (Vercel Cron) | ⏳ |
| F | PWA install + offline shell + "your week is ready" notification | ⏳ |
| U | UX/UI review: missing tools and features, cleaner and more intuitive screens (after the coach works end to end) | ⏳ |
| Later | "Ask coach" chat in the app; next season after Padova | ⏳ |

## Garmin sync

Garmin Connect → intervals.icu (their side) → `POST /api/sync` → `activities`.

- Runs automatically when the Week View opens (at most every 10 min) and on the "↻ Garmin" button.
- Window: last 30 days on first sync, then from the latest synced day − 3 days. Idempotent (unique `user_id, external_id`).
- Runs / trail / virtual / treadmill → `run`; `WeightTraining` → `gym`; `Workout` / `HIIT` / `Crossfit` → `cardio` (HIIT finishers: count in load, not as gym sessions) unless the Garmin name says strength ("Pesi"); rides (incl. indoor / exercise bike), swims, rowing, elliptical → `cross` (easy aerobic time: counts in load with an HR-based RPE, never in run km). The raw type is kept in `activities.sport_type`. Other sports are skipped.
- Same-day `approved`/`edited` plan of the same kind → `completed`. `proposed` plans are never touched.
- Same-day manual gym logs → `garmin_confirmed = true`.
- Completed gym workouts → linked to the longest same-day `gym` activity (`workouts.activity_id`); the session RPE is copied onto it.
- Each synced workout shows a feedback card (feeling, RPE, notes). "Pain" creates a `pain_reported` flag.
- **HR streams:** runs and bike/swim get their intervals.icu HR stream stored as a histogram (`activities.hr_hist`, seconds per bpm; `{}` = no HR). Up to 20 per sync, newest first, so history backfills over a few syncs.
- **Settings:** each sync refreshes `athlete_settings` (rest/max HR, planned-load calibration). The threshold HR in that row is only ever set by you (Season → Efforts). Streams and settings never fail a sync.

## Gym logger (`/gym`)

Schema: `exercises` (starter library with `user_id` NULL + your own), `workout_templates` → `template_exercises` (sets × rep range @ RIR, `main`/`finisher` block), `workouts` → `workout_exercises` → `workout_sets`. `exercise_targets` holds per-week overrides for Phase C (engine writes `proposed`, you approve). Migration: `supabase/migrations/20260929120000_gym_logger.sql`.

- **Local-first:** the in-progress workout lives in `localStorage`; every edit bumps a revision and is pushed as idempotent upserts on client-generated UUIDs (`src/lib/gym/push.ts`). Offline edits retry on reconnect and every 10 s; deletes are tombstoned until confirmed. Logic is pure and tested in `src/lib/gym/workout.ts`.
- **Prefill:** previous set today → last time's first working set → template target.
- **Coach week rules** (`src/lib/gym/rules.ts`, `gym_week_rules`): a week the coach set rules for (via a `gym_rules_set` proposal you approved) uses them instead of the default block rules below. A rule = `match` (main/finisher, compound/isolation, upper/lower, muscles, exercises, templates, first N) + changes (sets, ± sets, × sets, RIR, ± RIR, RIR floor/cap, last-set RIR, rep range, weight keep/add/lower, note); rules stack in order. Shown on top of progression exactly like the block weeks, accepted per exercise.
- **Templates by block** (`workout_templates.gym_focus`, `src/lib/gym/templates.ts`): a template lists the block gym focuses it's for (none = every block). The Gym tab rotates the current block's templates (the rest under "Other workouts"), the Today card and the week checks use them; tags are editable on each template, archived templates can be restored. The week's gym target comes from the season week.
- **Block weeks** (`src/lib/gym/periodization.ts`, default rules): the approved season sets this week's step, counting back from the next lighter week. Lighter week (deload, taper, recovery, transition) → half the sets (rounded up), RIR ≥ 3, **same weight** (unless progression says lower), finishers untouched. In hypertrophy blocks, 2 weeks before it → +1 set on the session's two upper-body compounds; the week before → last set of the upper-body accessories to RIR 0 (prefilled on the last set). Base 1: 12 Oct +1 set · 19 Oct RIR 0 · 26 Oct deload. Shown inside the same suggestion and accepted the same way.
- **Progression suggestions** (`src/lib/gym/progression.ts`, pure + tested): on each exercise, from your last session of it, computed on the phone when you open the workout. Judged on the sets at the weight you did most sets at (a top set + back-offs → the back-offs; a tie → the weight you finished on). Half the sets under the range → **lower the weight** (unless easier than target RIR: then push to the target RIR); every target set at the top of the range and not grinding, or ≥ 2 RIR easier than target → **add weight** (restart at the bottom); otherwise **same weight, +1 rep per set**. No suggestion for finishers, timed or fixed-rep-no-RIR exercises. The app never proposes kilos. **Accept** (per exercise or "Accept all") sets the target and prefills the judged weight and the reps to aim for; **Ignore** keeps the template. Accepted suggestions are saved as `approved` `exercise_targets` rows (source `engine`, with the reason) so the coach sees what you took on.
- **Finish:** session RPE → linked Garmin activity's `rpe` (so it counts in sRPE load once) and its feedback card is answered.
- Opening `/gym` needs signal once (no service worker until Phase F); after that the workout runs offline.
- **Templates** (`/gym/templates`): sets × rep range @ RIR, rest, main/finisher per exercise. Week View gym plans can point at one (Start workout); finishing completes the plan.
- **Live:** `LiveRefresh` (in `PageShell`) listens to Supabase Realtime on `activities`, `weekly_plans`, `exercise_targets`, `checkins` and finished `workouts`, and refreshes the screen; muscle meters in the logger include the workout in progress.
- **Today card** (Week View): rule-based suggestion (`src/lib/gym/today.ts`: plan first, next template in rotation, 48 h between full-body sessions) until the AI coach plans the week.

## Coach inbox (`coach_proposals`, `src/lib/coach/`)

Every change a coach wants to make to things that already exist goes through one table. A coach only **inserts** a `proposed` row (`kind`, `payload`, `title`, `rationale`, `source`); the Week View shows it as "Proposed changes" with before → after; **Approve** calls `apply_coach_proposal(id)`, which applies it in one transaction (RLS still applies; past or completed sessions never change), **Reject** keeps everything. Kinds: `session_update`, `session_cancel`, `template_exercise_add` / `_update` / `_swap` / `_remove`, `template_create`, `template_archive`, `template_update` (rename, block tags, archive / restore), `exercise_create`, `gym_rules_set` (payloads in the migration headers and in the Cowork instructions; migration `20261008120000_coach_gym_tools.sql`). New sessions stay plain `proposed` `weekly_plans` rows; season changes stay `create_season_proposal`. Migration: `supabase/migrations/20261007120000_coach_proposals.sql`.

The app's own **gym questions** (`src/lib/gym/questions.ts`, C2d) use the same table: Yes inserts the change as `source = 'engine'` and applies it; No stores it rejected, and the same question (`dedupe_key`) isn't asked again for 4 weeks.

## Week checks (`src/lib/week-checks.ts`)

Your rules on the week's plan (all statuses, plus 2 days either side for spacing across weeks), shown on the Week View above Approve. They warn, never block.

| Severity | Rule |
|---|---|
| red | Gym and a hard run (quality or long) on the same day; two hard runs on the same day or on consecutive days; the leg-heaviest gym session the day before a hard run |
| amber | Leg-heaviest session 2 days before a hard run (~48 h); gym on consecutive days; vs the season week: fewer gym sessions, more runs, more quality sessions (max 2), no long run, km off by > 10% |

Hard run = long run, or a run whose type names tempo / intervals / threshold / fartlek / VO₂ / race / marathon pace. Leg-heaviest = the template(s) with the most loaded leg sets (main block, target RIR set, primary quads / hamstrings / glutes; box jumps don't count): today C (6) vs A and B (3).

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
| Session load (sRPE) | `duration_min × RPE` (AU). Missing RPE → runs and bike/swim: `15 × HRR − 6` from avg HR; gym/other: your median RPE for the type; else 5 |
| Load by type | run · gym · HIIT (Garmin cardio finishers) · bike/swim; unlinked logged workouts count as gym |
| Planned load (`src/lib/load.ts`) | per season week: `km × easy min/km × easy RPE + 25′ × (7 − easy RPE)` per quality session + `gym × usual min × usual RPE` (× 0.6 lighter week) + usual weekly HIIT (½ lighter, 0 without gym) + `bike × usual min × RPE`. Calibrated on the last 6 complete weeks (medians, ≥ 2 sessions, else defaults). `season_weeks.load_target` overrides it. Done within ±10% = on plan |
| Time in zones (`src/lib/zones.ts`) | HR histogram binned into the Efforts bands (65 / 75 / 84 / 90% HRR). A measured threshold HR scales every edge so 84% lands on it; history re-bins |
| 80/20 | runs + bike/swim; easy = < 75% HRR, moderate = MP (75–84%), hard = ≥ 84%; MP counts on the hard side (Seiler). ≥ 80% easy good · 70–80% amber (expected in Specific/Peak) · < 70% red; < 60′ zoned not judged |
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
  lib/load.ts               # planned load: calibration + estimate per season week (pure, tested)
  lib/zones.ts              # HR histogram, zones, 80/20 (pure, tested)
  lib/athlete.ts            # athlete_settings, HR streams, weekly load + zones loader
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
  components/               # bottom nav + page shell, status chip, target + load meters, shared classes
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
| Run-load ramp | Planned run load ≤ +10% over the highest of the last 3 build weeks (steps ≤ 100 AU pass); catches a quality session added at the same km |
| Projected load ACWR | Planned total load ÷ mean of the 4 weeks before (actual load before the season) ≤ 1.3; not judged under 300 AU/week |
| Your caps | `limits`: max runs/week, max week km, max long run, max gym/week |
| Race week | The last week contains the goal date |

Race weeks (goal and tune-ups) skip ramp, share and cap checks.
- **Progress.** Done work per week: run km, runs, longest run and gym days (Garmin strength or finished workouts; HIIT doesn't count). ±6% of the km target is on target: a week is judged on totals, not on which day a run happened.
- **Efforts.** HR bands as % of heart-rate reserve on your Garmin anchors (recovery < 65%, easy 65–75%, MP 75–84%, threshold 84–90%, intervals 90–97%); paces offset from goal marathon pace (Daniels VDOT tables). Tests in the plan replace the pace targets.
- **Races.** The goal race is A; tune-ups live in `goals.params.tune_up_races` with priority B/C and distance, added from the Season page. Tests inside the plan (time trials) are week `milestone`s.
- **Week View** shows the approved season's targets for the week with progress meters, plus the week's load by type vs plan and the 80/20 split.
- **Load.** The Season page charts planned vs done load per week (stacked by type), the Now card adds load and 80/20 meters, each week row shows planned / done load and easy share. Week edits take a load target (blank = estimate). Migration: `supabase/migrations/20261005170000_load.sql`.
- **Views for coaches** (read-only, `security_invoker`): `session_loads`, `weekly_load`, `season_week_load`, `weekly_zones`, `hr_zone_cuts`, `weekly_muscle_sets` (hard sets per muscle, same rule as `strength.ts`), `easy_runs` (EF and pace at 65% HRR per easy run, same rule as `metrics.ts`). Same formulas as the app, reading `athlete_settings`; Cowork reads load from them instead of recomputing (one difference: the views take the median RPE over all history, the app over the last 16 weeks).
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

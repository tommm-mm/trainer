# Handoff: where the build stands (9 Oct 2026)

For a new Claude Code session. Read `README.md` (build status + formulas) and
`docs/coach/cowork-instructions.md` (the PT's rules) first.

## Working agreements with Tommaso

- **Plan + clarifying questions before coding**, roadmap first; data-driven, short reasons.
- **Automate the plumbing, never the judgment.** Every change is a suggestion / proposal he
  approves in the app (Accept, Approve, Yes). Nothing applies by itself.
- Work on a branch, open a PR, **merge only with his OK**. Apply DB migrations to Supabase
  (project `cvfdficzypuxkumyimwd`) only with his OK, before or with the merge.
- Verify against **real data** (Supabase, read-only queries) before claiming a rule works: every
  step so far found bugs that way (see the PR descriptions).
- Tests: `npm test`; checks: `npx tsc --noEmit`, `npx eslint src`; before tsc in a fresh clone run
  `npx next typegen`. Local Postgres 16 is available in the cloud container for testing
  migrations (stub `auth` schema + base tables, see PR #13 / #17 notes).

## Done (merged)

| Step | What | PR |
|---|---|---|
| L | load by type, planned load, load guardrails, HR zones + 80/20, SQL views for Cowork | #13 |
| C2b | gym progression suggestions in the logger (sets × reps @ RIR + add / same / lower weight) | #14 |
| C2a | week checks on the Week View (red = safety, amber = rest, warn only) | #15 |
| C2c | block periodization (+1 set, last set RIR 0, deload) from the approved season | #16 |
| D0 + C2d | `coach_proposals` inbox; the app's own gym questions as Yes / No cards | #17 |
| C2c+ | coach gym tools: templates by block, `exercise_create`, `template_update`, week rules | #18 |

## In review (this PR, from Cowork's feedback of 8 Oct)

1. **Quick check-in**: calves 0–3 + one niggle on the Week View (until today has one); calves ≥ 2 or a
   niggle opens a `niggle` flag. Views `weekly_muscle_sets`, `easy_runs` for Cowork.
2. **Draft checks in SQL**: `check_season_draft(goal, draft)` and `check_week(monday, draft?)`, same rules
   as `model.ts` / `load.ts` / `week-checks.ts`. **Parity**: `src/lib/checks.fixtures.json` is asserted on
   the TS by `npm test` and on the SQL by `npm run parity:sql` (needs a local Postgres with the
   migrations, see `scripts/sql-parity.mjs`). Change a rule → change both → run both.
3. **Run detail**: km splits, HR drift (Friel decoupling), watch laps in `activities.run_detail`
   (10 runs per sync); Week View "Splits" fold; views `run_details`, `run_splits`.
4. **W wellness**: `wellness` table (HRV, resting HR, sleep, VO₂max, CTL/ATL), Recovery card, Stats charts,
   view `wellness_trend`.

Not built (Tommaso's call): a decision log in the app (it lives in the Cowork project); weather.
**Verify on live after the first syncs:** run detail and wellness (intervals.icu field names were
parsed defensively, never seen from the container).

## Next (roadmap, in order of value)

1. **Build templates** (before 30 Nov): **Cowork designs and proposes them** (templates tagged
   `strength`, any new exercises, week rules). After the first Build week, verify on real data
   (prefill, suggestions, week checks, Today rotation).
2. **D1** AI planner via the Claude API (writes the same proposals), then **E** automatic Sunday
   plan, **F** PWA + notifications, **U** UX review.

## Open data points to watch

- HR streams: 40 / 46 runs had one on 7 Oct; the rest arrive with the next syncs.
- Threshold test Sat 14 Nov → he enters the HR on Season → Efforts (zones re-centre).
- intervals.icu is blocked from the cloud container (proxy 403): stream parsing is only tested
  on fixtures; verify on live data after syncs.
- `git push` to the branch once failed for ~20 min with GitHub "Internal Server Error": the
  GitHub API (`push_files`) works as a fallback; verify the tree with `git diff` afterwards.

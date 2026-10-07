# Handoff: where the build stands (7 Oct 2026)

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

## In review

- **D0 + C2d** (this PR): `coach_proposals` inbox so Cowork can move / change / cancel sessions
  and change gym templates (Approve on the Week View applies it atomically); the app's own gym
  questions (volume gaps, stalls) as Yes / No cards. Needs migration
  `20261007120000_coach_proposals.sql` applied.

## Next (roadmap, in order of value)

1. **C2c+ Build templates** (before 30 Nov): 2× strength templates (3×4–6 @ RIR 2, heavy legs +
   plyos). Cowork can now propose them with `template_create`; the strength block also needs its
   own progression rules (e.g. load waves) if Tommaso wants more than double progression.
2. **W** Garmin wellness sync (HRV, resting HR, sleep) → recovery flags in the Cowork check.
3. **D1** AI planner via the Claude API (writes the same proposals), then **E** automatic Sunday
   plan, **F** PWA + notifications, **U** UX review.

## Open data points to watch

- HR streams: 40 / 46 runs had one on 7 Oct; the rest arrive with the next syncs.
- Threshold test Sat 14 Nov → he enters the HR on Season → Efforts (zones re-centre).
- intervals.icu is blocked from the cloud container (proxy 403): stream parsing is only tested
  on fixtures; verify on live data after syncs.
- `git push` to the branch once failed for ~20 min with GitHub "Internal Server Error": the
  GitHub API (`push_files`) works as a fallback; verify the tree with `git diff` afterwards.

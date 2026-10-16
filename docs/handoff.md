# Handoff: where the build stands (16 Oct 2026)

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
- Local Postgres for migrations: `pg_ctlcluster 16 main start && scripts/local-db.sh` (Supabase stubs +
  base tables + every migration), then `su postgres -c "psql -d trainer"`; SQL parity:
  `PSQL="sudo -u postgres psql -d trainer" npm run parity:sql`.
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
| Cowork feedback | quick check-in (calves, niggle), draft checks in SQL, run detail (splits, laps, decoupling), wellness/recovery | #19 |
| F | installable app (PWA) + push notifications: proposal summary, 16:00 check-in reminder | #20 |

## Done since #19 (verified on live data 9 Oct)

- Wellness: 121 days synced (HRV, resting HR, sleep, VO₂max, CTL/ATL); field names right.
- Run detail: 10 runs with splits; the 8 Oct fartlek shows its 8 × 1′ reps as laps.

## F state (push notifications)

Android / Chrome. Settings page (`/settings`, linked from the Week View header). Notifications:
proposal summary (2 quiet minutes after Cowork's last write) and a check-in reminder at 16:00
Europe/Amsterdam (changeable). Plumbing in `supabase/migrations/20261009160000_push.sql` (pg_cron +
pg_net + Vault) and `src/app/api/push/tick`. Not chosen by Tommaso: recovery-warning notifications.

Applied to Supabase in pieces (the connector timed out on the whole file): `push_extensions`,
`push_tables`, `push_enqueue`, `push_due`, `push_tick` (+ cron job `push-tick`, every 5 min).
`push_report` never went through the connector: any SQL with `delete` needs an approval that times out
after 60 s (tried 4× on 9, 12 and 13 Oct, Tommaso watching). The rest of the health migration was
applied via the connector on 13 Oct (`health_columns_due_health`): only `push_report` is left to paste. It is re-created by
`20261012090000_health.sql` (step H), which Tommaso pastes into the Supabase SQL Editor.
**Rule: SQL containing `delete` → give Tommaso the file to paste, don't use the connector.**
Phone registered 9 Oct (Android/Chrome); 75/75 ticks OK, HTTP 200.
Vercel env set: `VAPID_PRIVATE_KEY`, `PUSH_SECRET`. Vault: `push_secret`, `push_app_url`.
To verify: `push_subscriptions` row after he turns notifications on; `net._http_response` status 200
for the tick calls; first real proposal summary; 16:00 reminder on a day without check-in.

## Next (roadmap, re-prioritised 16 Oct)

1. **Marathon prediction + race pace (RP)**: built 16 Oct (PR from `claude/optimistic-archimedes-1obdf7`).
   After merge: apply `20261016090000_race_prediction.sql` (a view, no `delete`: the connector works),
   Tommaso taps **Import 12 months** on the Season card → verify on live that the anchor = his March
   half (≈ 1:39) and that the calibration factor is sane (expected ≈ 1.15–1.25).
   Real-data findings (16 Oct): HR-based VDOT reads 34–38 on easy runs vs ~44–46 on hard ones (hence
   easy-runs-only fitness); easy-run VDOT slid June 39.7 → now 36.2 (same HR, ~20–25 s/km slower);
   a hard 5 km at 87 % HRR is not a race (the race rule caught it). Shape today ≈ 45 %
   (27 km/week, longest 13 km).
2. **UX & UI**: options drafted in `docs/ux-options.md` (Today-first, Coach feed, Plan calendar, Goal
   dashboard; recommendation = 4-tab hybrid). He picks → screen-by-screen spec → small PRs (Today first).
3. To discuss after RP: **Readiness → today's call** (design agreed 13 Oct: in-app, Garmin only, one
   safe "make it easier" default, Cowork decides bigger changes from a `readiness_days` view; backtest
   on 120 days first), **Weekly report card**, **Travel mode** (before December: ranges + per-day,
   `no_gym` / `transit` / `limited`, checks in TS **and** `check_week`).
4. **Build templates** (before 30 Nov): Cowork designs and proposes them.
5. Parked: calf / niggle management rules, Monday push (dropped), D1 AI planner, E server Sunday plan.
6. Measure use after 2–3 weeks: check-ins per week, proposals approved vs edited.
7. Still open: paste `push_report` (13 lines, in `20261012090000_health.sql`) in the Supabase SQL Editor.

## Open data points to watch

- HR streams: 40 / 46 runs had one on 7 Oct; the rest arrive with the next syncs.
- Threshold test Sat 14 Nov → he enters the HR on Season → Efforts (zones re-centre).
- intervals.icu is blocked from the cloud container (proxy 403): stream parsing is only tested
  on fixtures; verify on live data after syncs.
- `git push` to the branch once failed for ~20 min with GitHub "Internal Server Error": the
  GitHub API (`push_files`) works as a fallback; verify the tree with `git diff` afterwards.

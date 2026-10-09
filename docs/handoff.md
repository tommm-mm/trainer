# Handoff: where the build stands (9 Oct 2026, night)

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
**Still missing: `push_report`** (the Supabase connector asks for approval on any `delete` and the
prompt times out after 60 s; apply it while Tommaso is watching to approve). Until then sends work,
the route only logs "push_report failed" and dead subscriptions aren't cleaned up.
Vercel env set: `VAPID_PRIVATE_KEY`, `PUSH_SECRET`. Vault: `push_secret`, `push_app_url`.
To verify: `push_subscriptions` row after he turns notifications on; `net._http_response` status 200
for the tick calls; first real proposal summary; 16:00 reminder on a day without check-in.

## Next (roadmap, in order of value)

1. **Build templates** (before 30 Nov): **Cowork designs and proposes them** (templates tagged
   `strength`, any new exercises, week rules). After the first Build week, verify on real data.
2. **U** UX pass: home = "what do I do today + is anything red"; fewer numbers up front, details
   one tap away. Use Tommaso's notes; ask him for them first.
3. **Health line** in Settings: last intervals.icu sync, last notification sent, last tick; warn after
   24 h without a sync.
4. **Monday "week ahead" notification** (sessions, km, key session), reusing the push plumbing; opt-in
   in Settings.
5. **Race-pace tracker** toward Padova (18 Apr 2027): trend of threshold / marathon-pace runs vs the
   target, exposed as a view for Cowork.
6. **Travel / Erasmus mode**: mark days without gym or in transit so Cowork plans around them.
7. Measure use after 2–3 weeks: check-ins per week, proposals approved vs edited.
8. Parked: **D1** AI planner in the app and **E** server Sunday plan (Cowork does both).

## Open data points to watch

- HR streams: 40 / 46 runs had one on 7 Oct; the rest arrive with the next syncs.
- Threshold test Sat 14 Nov → he enters the HR on Season → Efforts (zones re-centre).
- intervals.icu is blocked from the cloud container (proxy 403): stream parsing is only tested
  on fixtures; verify on live data after syncs.
- `git push` to the branch once failed for ~20 min with GitHub "Internal Server Error": the
  GitHub API (`push_files`) works as a fallback; verify the tree with `git diff` afterwards.

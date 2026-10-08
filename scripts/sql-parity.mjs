#!/usr/bin/env node
// SQL side of the draft-check parity cases (src/lib/checks.fixtures.json).
// Runs each case against check_season_draft / check_week in a Postgres that
// has the migrations applied, inside a rolled-back transaction, and compares
// with the `expect` the app side (checks-parity.test.ts) is held to.
//
//   PSQL="psql -h localhost -U postgres -d trainer" node scripts/sql-parity.mjs
//
// Needs psql on PATH (or PSQL); never point it at production data you care
// about (it only writes inside a transaction it rolls back).

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const fixtures = JSON.parse(readFileSync(new URL("../src/lib/checks.fixtures.json", import.meta.url), "utf8"));
const psql = (process.env.PSQL ?? "psql").split(" ");
const USER = "00000000-0000-0000-0000-0000000000aa";
const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

function run(sql) {
  const out = execFileSync(psql[0], [...psql.slice(1), "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], {
    input: `begin;\n${sql}\nrollback;\n`,
    encoding: "utf8",
  });
  return JSON.parse(out.trim().split("\n").filter(Boolean).at(-1));
}

const setup = `
insert into auth.users (id) values ('${USER}') on conflict do nothing;
set local role authenticated;
select set_config('app.uid', '${USER}', true), set_config('request.jwt.claim.sub', '${USER}', true);
`;

let failures = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) console.log(`  sql: ${JSON.stringify(got)}\n  app: ${JSON.stringify(want)}`);
};

for (const c of fixtures.season) {
  const goal = "00000000-0000-0000-0000-000000000001";
  const sql = `${setup}
insert into goals (id, user_id, status, target_date, params)
values ('${goal}', '${USER}', 'active', ${q(c.goal.target_date)}, ${q(JSON.stringify({ tune_up_races: c.goal.tune_up_races }))}::jsonb);
insert into athlete_settings (user_id, load_calibration) values ('${USER}', ${q(JSON.stringify(c.calibration))}::jsonb);
${c.history
  .map(
    (h) => `insert into activities (user_id, date, type, name, distance_km, duration_min, rpe)
values ('${USER}', '${addDays(h.week_start, 2)}', 'run', 'history', ${h.run_km}, ${h.run_load / 5}, 5);`,
  )
  .join("\n")}
select check_season_draft('${goal}', ${q(JSON.stringify(c.draft))}::jsonb);`;
  const r = run(sql);
  check(`season: ${c.name}`, { errors: r.errors.length, warnings: r.warnings.map((w) => `${w.week_start} ${w.code}`) }, c.expect);
}

for (const c of fixtures.week) {
  const sql = `${setup}
insert into exercises (id, user_id, name, primary_muscles, equipment, mechanic)
values ('00000000-0000-0000-0000-0000000000e1', '${USER}', 'Parity leg lift', '{quads}', 'barbell', 'compound');
${c.templates
  .map(
    (t, i) => `insert into workout_templates (id, user_id, name, position) values ('${t.id}', '${USER}', ${q(t.name)}, ${i + 1});
${t.leg_sets > 0 ? `insert into template_exercises (user_id, template_id, exercise_id, block, position, sets, rep_min, rep_max, target_rir)
values ('${USER}', '${t.id}', '00000000-0000-0000-0000-0000000000e1', 'main', 1, ${t.leg_sets}, 5, 5, 2);` : ""}`,
  )
  .join("\n")}
${
  c.target
    ? `insert into goals (id, user_id, status, target_date, params) values ('00000000-0000-0000-0000-000000000001', '${USER}', 'active', null, '{}');
insert into seasons (id, user_id, goal_id, version, status, source, title)
values ('00000000-0000-0000-0000-000000000002', '${USER}', '00000000-0000-0000-0000-000000000001', 1, 'approved', 'manual', 'parity');
insert into mesocycles (id, user_id, season_id, position, name, focus, gym_focus)
values ('00000000-0000-0000-0000-000000000003', '${USER}', '00000000-0000-0000-0000-000000000002', 1, 'Build', 'build', null);
insert into season_weeks (user_id, season_id, mesocycle_id, week_start, run_km, long_run_km, runs, quality_sessions, gym_sessions)
values ('${USER}', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '${c.monday}',
  ${c.target.run_km}, ${c.target.long_run_km}, ${c.target.runs}, ${c.target.quality_sessions}, ${c.target.gym_sessions});`
    : ""
}
${(c.as_draft ? [] : c.plans)
  .map(
    (p, i) => `insert into weekly_plans (user_id, week_start_date, day, session_type, target_distance_km, template_id, status, created_at)
values ('${USER}', date_trunc('week', '${p.day}'::date)::date, '${p.day}', ${q(p.session_type)}, ${p.target_distance_km ?? "null"},
  ${q(p.template_id)}, 'proposed', now() + interval '${i} seconds');`,
  )
  .join("\n")}
select check_week('${c.monday}'${c.as_draft ? `, ${q(JSON.stringify(c.plans))}::jsonb` : ""});`;
  const r = run(sql);
  check(`week: ${c.name}`, r.map((x) => `${x.severity} ${x.code} ${x.days.join(",")}`.trim()), c.expect);
}

if (failures) {
  console.error(`${failures} case(s) differ between SQL and app`);
  process.exit(1);
}

// The app side of the SQL parity cases (src/lib/checks.fixtures.json): runs
// the TS guardrails / week checks on a case, in the same shape the SQL
// functions return (check_season_draft, check_week). Used by
// checks-parity.test.ts and scripts/sql-parity.mjs.

import { addDays, mondayOf } from "@/lib/dates";
import { DEFAULT_CALIBRATION, type LoadCalibration } from "@/lib/load";
import { validateSeasonDraft, type SeasonDraft } from "@/lib/season/model";
import { checkWeek, type PlanInput } from "@/lib/week-checks";

export type SeasonCase = {
  name: string;
  today: string;
  goal: { target_date: string | null; tune_up_races: { name: string; date: string }[] };
  calibration: Partial<LoadCalibration>;
  history: { week_start: string; run_km: number; run_load: number }[];
  draft: SeasonDraft;
  expect?: { errors: number; warnings: string[] };
};

export type WeekCase = {
  name: string;
  monday: string;
  templates: { id: string; name: string; leg_sets: number }[];
  target: { run_km: number; long_run_km: number; runs: number; quality_sessions: number; gym_sessions: number } | null;
  plans: PlanInput[];
  expect?: string[];
};

/** "week_start code" per warning, in order; errors only counted (wording may differ). */
export function seasonResult(c: SeasonCase): { errors: number; warnings: string[] } {
  const start = c.draft.blocks?.[0]?.weeks?.[0]?.week_start ?? c.today;
  const hist = [0, 1, 2, 3].map((i) => {
    const ws = addDays(mondayOf(start), -28 + 7 * i);
    return c.history.find((h) => h.week_start === ws) ?? { week_start: ws, run_km: 0, run_load: 0 };
  });
  const races = [...c.goal.tune_up_races.map((r) => r.date)];
  const res = validateSeasonDraft(c.draft, {
    today: c.today,
    history: hist.map((h) => ({ week_start: h.week_start, run_km: h.run_km })),
    raceDates: races,
    goalDate: c.goal.target_date,
    load: {
      calibration: { ...DEFAULT_CALIBRATION, ...c.calibration },
      history: hist.map((h) => ({ week_start: h.week_start, total: h.run_load, run: h.run_load })),
    },
  });
  return { errors: res.errors.length, warnings: res.warnings.map((w) => `${w.week_start} ${w.code}`) };
}

/** "severity code days" per check, red first. */
export function weekResult(c: WeekCase): string[] {
  const checks = checkWeek({
    monday: c.monday,
    plans: c.plans,
    templates: c.templates.map((t) => ({ id: t.id, name: t.name, legSets: t.leg_sets })),
    target: c.target ? { week_start: c.monday, ...c.target } : null,
  });
  return checks.map((x) => `${x.severity} ${x.code} ${x.days.join(",")}`.trim());
}

// Marathon prediction + race-pace tracker for the active goal: shown on Progress.
import type { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/database.types";
import { addDays } from "@/lib/dates";
import { isPlannedTest, predictMarathon } from "@/lib/race-predict";
import { mpHrSlope, mpWeeks, segmentsOf } from "@/lib/race-pace";
import type { RaceParams } from "@/lib/domain";
import type { RaceForecast } from "./race-card";

type DB = Awaited<ReturnType<typeof createClient>>;

/** 12 months of runs (race anchor) and the plan's tests → the forecast; null without a target time. */
export async function loadForecast(
  supabase: DB,
  goal: Tables<"goals">,
  anchors: { rest: number; max: number },
  today: string,
): Promise<RaceForecast | null> {
  const [runsRes, testsRes] = await Promise.all([
    supabase
      .from("activities")
      .select("date, name, distance_km, duration_min, avg_hr, run_detail")
      .eq("type", "run")
      .gte("date", addDays(today, -365))
      .lte("date", today)
      .order("date"),
    // Races / time trials / tests the plan scheduled: they anchor the prediction.
    supabase
      .from("weekly_plans")
      .select("day, session_type, notes")
      .gte("day", addDays(today, -365))
      .lte("day", today)
      .neq("status", "proposed"),
  ]);
  const testDays = new Set((testsRes.data ?? []).filter(isPlannedTest).map((p) => p.day));
  return raceForecast(goal.params as RaceParams, runsRes.data ?? [], anchors, today, testDays);
}

const PACE_WEEKS = 12;

/** Prediction + race-pace tracker for a goal with a target time and distance; null otherwise. */
function raceForecast(
  p: RaceParams,
  rows: { date: string; name: string | null; distance_km: number | null; duration_min: number | null; avg_hr: number | null; run_detail: unknown }[],
  anchors: { rest: number; max: number },
  today: string,
  testDays: Set<string>,
): RaceForecast | null {
  if (!p.target_time_seconds || !p.distance_km) return null;
  const mp = Math.round(p.target_time_seconds / p.distance_km);
  const runs = rows
    .filter((r) => r.distance_km !== null && r.duration_min !== null)
    .map((r) => ({ date: r.date, name: r.name, distance_km: Number(r.distance_km), duration_min: Number(r.duration_min), avg_hr: r.avg_hr }));
  // On a planned test day the test is the longest run (warm-up and cool-down are separate activities).
  for (const day of testDays) {
    const main = runs.filter((r) => r.date === day).sort((x, y) => y.distance_km - x.distance_km)[0];
    if (main) Object.assign(main, { planned_test: true });
  }
  const segments = segmentsOf(
    rows
      .filter((r) => r.date >= addDays(today, -7 * PACE_WEEKS))
      .map((r) => ({ date: r.date, run_detail: (r.run_detail ?? null) as Parameters<typeof segmentsOf>[0][number]["run_detail"] })),
    mp,
    anchors,
  );
  const weeks = mpWeeks(segments);
  return {
    target: p.target_time_seconds,
    mp,
    prediction: predictMarathon(runs, anchors, today),
    segments,
    mpWeeks: weeks,
    mpSlope: mpHrSlope(weeks),
    oldestRun: runs[0]?.date ?? null,
  };
}

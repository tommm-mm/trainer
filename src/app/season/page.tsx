import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import { addDays, mondayOf, todayISO } from "@/lib/dates";
import { loadAthlete, loadWeeks } from "@/lib/athlete";
import { flattenWeeks } from "@/lib/season/model";
import { weeklyActuals } from "@/lib/season/progress";
import { historyBefore, loadSeasons } from "@/lib/season/queries";
import { SeasonView } from "./season-view";
import { predictMarathon } from "@/lib/race-predict";
import { mpHrSlope, mpWeeks, segmentsOf } from "@/lib/race-pace";
import type { RaceParams } from "@/lib/domain";
import type { RaceForecast } from "./race-card";

export default async function SeasonPage({ searchParams }: PageProps<"/season">) {
  const { view } = await searchParams;
  const today = todayISO();
  const supabase = await createClient();
  const goal = await getActiveGoal(supabase);
  if (!goal) return <SeasonView today={today} goal={null} approved={null} proposed={null} />;

  const { approved, proposed } = await loadSeasons(supabase, goal.id);
  const any = approved ?? proposed;
  if (!any) return <SeasonView today={today} goal={goal} approved={null} proposed={null} />;

  // Done work and history from the earliest week of either version.
  const start = [approved, proposed]
    .filter((s) => s !== null)
    .map((s) => flattenWeeks(s.blocks)[0]?.week_start ?? today)
    .sort()[0];
  const [actsRes, workoutsRes, athlete, history, runsRes] = await Promise.all([
    supabase.from("activities").select("date, type, distance_km").gte("date", start).lte("date", today),
    supabase.from("workouts").select("date").eq("status", "completed").gte("date", start),
    loadAthlete(supabase, today),
    historyBefore(supabase, start),
    // Marathon prediction: 12 months of runs (race anchor), run detail only for the pace tracker window.
    supabase
      .from("activities")
      .select("date, name, distance_km, duration_min, avg_hr, run_detail")
      .eq("type", "run")
      .gte("date", addDays(today, -365))
      .lte("date", today)
      .order("date"),
  ]);
  const forecast = raceForecast(goal.params as RaceParams, runsRes.data ?? [], athlete.anchors, today);
  // Load and zones from 4 weeks before the season (load ACWR seed) to this week.
  const loadFrom = addDays(start, -28);
  const thisMonday = mondayOf(today);
  const loadWeekList: string[] = [];
  for (let w = loadFrom; w <= thisMonday; w = addDays(w, 7)) loadWeekList.push(w);
  const { loads, zones } = await loadWeeks(supabase, athlete, loadWeekList, today);

  return (
    <SeasonView
      today={today}
      goal={goal}
      approved={approved}
      proposed={proposed}
      view={view === "proposed" ? "proposed" : undefined}
      actuals={weeklyActuals(
        (actsRes.data ?? []).map((a) => ({ ...a, distance_km: a.distance_km === null ? null : Number(a.distance_km) })),
        (workoutsRes.data ?? []).map((w) => w.date),
      )}
      anchors={athlete.anchors}
      thresholdDate={athlete.thresholdDate}
      calibration={athlete.calibration}
      history={history}
      loads={loads}
      zones={zones}
      forecast={forecast}
      loadHistory={loadWeekList
        .filter((w) => w < start)
        .map((w) => ({ week_start: w, total: loads.get(w)?.total ?? 0, run: loads.get(w)?.run ?? 0 }))}
    />
  );
}

const PACE_WEEKS = 12;

/** Prediction + race-pace tracker for a goal with a target time and distance; null otherwise. */
function raceForecast(
  p: RaceParams,
  rows: { date: string; name: string | null; distance_km: number | null; duration_min: number | null; avg_hr: number | null; run_detail: unknown }[],
  anchors: { rest: number; max: number },
  today: string,
): RaceForecast | null {
  if (!p.target_time_seconds || !p.distance_km) return null;
  const mp = Math.round(p.target_time_seconds / p.distance_km);
  const runs = rows
    .filter((r) => r.distance_km !== null && r.duration_min !== null)
    .map((r) => ({ date: r.date, name: r.name, distance_km: Number(r.distance_km), duration_min: Number(r.duration_min), avg_hr: r.avg_hr }));
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

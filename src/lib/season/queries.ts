import type { DB } from "@/lib/queries";
import { addDays } from "@/lib/dates";
import type { Tables } from "@/lib/database.types";
import { isOneOf, type RaceParams } from "@/lib/domain";
import { FOCUSES, GYM_FOCUSES, type BlockDraft, type SeasonLimits, type WeekTargets } from "./model";

export type LoadedWeek = WeekTargets & { id: string };
export type LoadedBlock = Omit<BlockDraft, "weeks"> & { id: string; position: number; weeks: LoadedWeek[] };
export type LoadedSeason = Omit<Tables<"seasons">, "limits"> & {
  limits: SeasonLimits;
  blocks: LoadedBlock[];
};

// numeric columns can arrive as strings; the model works on numbers.
const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function toSeason(
  row: Tables<"seasons"> & {
    mesocycles: (Tables<"mesocycles"> & { season_weeks: Tables<"season_weeks">[] })[];
  },
): LoadedSeason {
  const { mesocycles, ...season } = row;
  return {
    ...season,
    limits: (season.limits ?? {}) as SeasonLimits,
    blocks: [...mesocycles]
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        position: m.position,
        name: m.name,
        focus: isOneOf(FOCUSES, m.focus) ? m.focus : "base",
        gym_focus: isOneOf(GYM_FOCUSES, m.gym_focus) ? m.gym_focus : null,
        purpose: m.purpose,
        key_sessions: m.key_sessions,
        weeks: [...m.season_weeks]
          .sort((a, b) => a.week_start.localeCompare(b.week_start))
          .map((w) => ({
            id: w.id,
            week_start: w.week_start,
            is_deload: w.is_deload,
            run_km: n(w.run_km),
            long_run_km: n(w.long_run_km),
            runs: w.runs,
            quality_sessions: w.quality_sessions,
            gym_sessions: w.gym_sessions,
            cross_sessions: w.cross_sessions,
            load_target: w.load_target,
            key_session: w.key_session,
            milestone: w.milestone,
            notes: w.notes,
          })),
      })),
  };
}

/** The approved season and the open proposal (if any) for a goal. */
export async function loadSeasons(
  supabase: DB,
  goalId: string,
): Promise<{ approved: LoadedSeason | null; proposed: LoadedSeason | null; count: number }> {
  const { data, error } = await supabase
    .from("seasons")
    .select("*, mesocycles(*, season_weeks(*))")
    .eq("goal_id", goalId)
    .in("status", ["approved", "proposed"]);
  if (error) throw error;
  const { count } = await supabase
    .from("seasons")
    .select("id", { count: "exact", head: true })
    .eq("goal_id", goalId);
  const rows = (data ?? []).map(toSeason);
  return {
    approved: rows.find((s) => s.status === "approved") ?? null,
    proposed: rows.find((s) => s.status === "proposed") ?? null,
    count: count ?? rows.length,
  };
}

/** The approved season's targets for one week (Week View strip). */
export async function loadSeasonWeek(
  supabase: DB,
  goalId: string,
  monday: string,
): Promise<{ week: LoadedWeek; block: LoadedBlock; weekInBlock: number } | null> {
  const { approved } = await loadSeasons(supabase, goalId);
  for (const block of approved?.blocks ?? []) {
    const i = block.weeks.findIndex((w) => w.week_start === monday);
    if (i >= 0) return { week: block.weeks[i], block, weekInBlock: i + 1 };
  }
  return null;
}

/** Tune-up races stored on the goal, with the goal race itself as the A race. */
export type RaceItem = {
  date: string;
  name: string;
  priority: "A" | "B" | "C";
  distance_km: number | null;
  kind: "goal" | "race" | "milestone";
};

export function goalRaces(goal: Tables<"goals">): RaceItem[] {
  const p = (goal.params ?? {}) as RaceParams;
  const out: RaceItem[] = (p.tune_up_races ?? []).map((r) => ({
    date: r.date,
    name: r.name,
    priority: r.priority ?? "B",
    distance_km: r.distance_km ?? null,
    kind: "race",
  }));
  if (goal.goal_type === "race" && goal.target_date) {
    out.push({
      date: goal.target_date,
      name: p.race_name ?? goal.title,
      priority: "A",
      distance_km: p.distance_km ?? null,
      kind: "goal",
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Actual run km of the 4 full weeks before `monday`, for the ACWR guardrail. */
export async function historyBefore(supabase: DB, monday: string) {
  const from = addDays(monday, -28);
  const { data } = await supabase
    .from("activities")
    .select("date, distance_km")
    .eq("type", "run")
    .gte("date", from)
    .lt("date", monday);
  return [0, 1, 2, 3].map((i) => {
    const start = addDays(from, i * 7);
    const end = addDays(start, 7);
    const km = (data ?? [])
      .filter((a) => a.date >= start && a.date < end)
      .reduce((s, a) => s + Number(a.distance_km ?? 0), 0);
    return { week_start: start, run_km: Math.round(km * 10) / 10 };
  });
}

// athlete_settings: HR anchors, the threshold HR from a test and the
// planned-load calibration, one row per user. The sync refreshes anchors and
// calibration (plumbing); only you set the threshold, in the app (judgment).
// The SQL views Cowork reads use the same row, so both see the same numbers.

import type { DB } from "@/lib/queries";
import type { Json, Tables } from "@/lib/database.types";
import { addDays, mondayOf } from "@/lib/dates";
import { fetchHrHistogram, fetchHrSettings, fetchRunDetail, fetchWellness } from "@/lib/intervals";
import {
  resolveHrAnchors,
  sessionLoads,
  weeklyLoads,
  type ActivityInput,
  type HrAnchors,
  type WeekLoad,
} from "@/lib/metrics";
import { weeklyZones, type ZoneWeek } from "@/lib/zones";
import { calibrateLoad, CALIBRATION_WEEKS, DEFAULT_CALIBRATION, type LoadCalibration } from "@/lib/load";

export type Athlete = {
  anchors: HrAnchors & { threshold: number | null };
  thresholdDate: string | null;
  calibration: LoadCalibration;
  /** False until the first sync wrote the row (defaults / live values in use). */
  stored: boolean;
};

const SOURCES = { rest: ["garmin", "default"], max: ["garmin", "observed", "default"] } as const;

/** Parses a stored row; unknown or missing calibration keys fall back to the defaults. */
export function athleteFromRow(row: Tables<"athlete_settings">): Athlete {
  const raw = (row.load_calibration ?? {}) as Record<string, unknown>;
  const calibration = { ...DEFAULT_CALIBRATION };
  for (const k of Object.keys(DEFAULT_CALIBRATION) as (keyof LoadCalibration)[]) {
    const v = Number(raw[k]);
    if (raw[k] != null && Number.isFinite(v)) calibration[k] = v;
  }
  return {
    anchors: {
      rest: row.rest_hr,
      max: row.max_hr,
      restSource: (SOURCES.rest as readonly string[]).includes(row.rest_source)
        ? (row.rest_source as HrAnchors["restSource"])
        : "default",
      maxSource: (SOURCES.max as readonly string[]).includes(row.max_source)
        ? (row.max_source as HrAnchors["maxSource"])
        : "default",
      threshold: row.threshold_hr,
    },
    thresholdDate: row.threshold_date,
    calibration,
    stored: true,
  };
}

/** The stored settings, or live anchors + default calibration before the first sync. */
export async function loadAthlete(supabase: DB, today: string): Promise<Athlete> {
  const { data } = await supabase.from("athlete_settings").select("*").maybeSingle();
  if (data) return athleteFromRow(data);
  const [hr, maxRes] = await Promise.all([
    fetchHrSettings(addDays(today, -30), today),
    supabase.from("activities").select("max_hr").not("max_hr", "is", null).order("max_hr", { ascending: false }).limit(1),
  ]);
  const anchors = resolveHrAnchors({ garminRest: hr.restHr, garminMax: hr.maxHr, activities: maxRes.data ?? [] });
  return { anchors: { ...anchors, threshold: null }, thresholdDate: null, calibration: DEFAULT_CALIBRATION, stored: false };
}

/** Activities (+ unlinked logged workouts as gym sessions) from `from` on, as load inputs. */
export async function loadInputs(supabase: DB, from: string, to: string): Promise<ActivityInput[]> {
  const [acts, workouts] = await Promise.all([
    supabase
      .from("activities")
      .select("date, type, distance_km, duration_min, avg_hr, max_hr, rpe")
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("workouts")
      .select("date, started_at, finished_at, session_rpe")
      .eq("status", "completed")
      .is("activity_id", null)
      .gte("date", from)
      .lte("date", to),
  ]);
  if (acts.error) throw acts.error;
  if (workouts.error) throw workouts.error;
  const logged: ActivityInput[] = (workouts.data ?? [])
    .filter((w) => w.finished_at)
    .map((w) => ({
      date: w.date,
      type: "gym",
      distance_km: null,
      duration_min: Math.round((Date.parse(w.finished_at!) - Date.parse(w.started_at)) / 60000),
      avg_hr: null,
      max_hr: null,
      rpe: w.session_rpe,
    }))
    .filter((w) => w.duration_min > 0);
  return [...(acts.data ?? []), ...logged];
}

/**
 * Refreshes rest/max HR and the load calibration. Never touches the
 * threshold: that comes from a test and is entered by you.
 */
export async function refreshAthleteSettings(supabase: DB, userId: string, today: string): Promise<void> {
  const from = addDays(today, -7 * (CALIBRATION_WEEKS + 10));
  const [hr, inputs] = await Promise.all([fetchHrSettings(addDays(today, -30), today), loadInputs(supabase, from, today)]);
  const anchors = resolveHrAnchors({ garminRest: hr.restHr, garminMax: hr.maxHr, activities: inputs });
  const calibration = calibrateLoad(inputs, anchors, today);
  const { error } = await supabase.from("athlete_settings").upsert(
    {
      user_id: userId,
      rest_hr: anchors.rest,
      max_hr: anchors.max,
      rest_source: anchors.restSource,
      max_source: anchors.maxSource,
      load_calibration: calibration,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
}

/** Histograms fetched per sync: new activities first, older ones backfill over a few syncs. */
export const HR_STREAMS_PER_SYNC = 20;
const STREAM_CONCURRENCY = 4;

/**
 * Fetches the HR stream of runs and bike/swim sessions that don't have a
 * histogram yet. A stream without HR is stored as an empty histogram so it
 * isn't fetched again; a failed request is retried on the next sync.
 */
export async function fillHrHistograms(supabase: DB, limit = HR_STREAMS_PER_SYNC): Promise<number> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, external_id")
    .eq("source", "garmin")
    .in("type", ["run", "cross"])
    .not("avg_hr", "is", null)
    .not("external_id", "is", null)
    .is("hr_hist", null)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const todo = data ?? [];
  let filled = 0;
  for (let i = 0; i < todo.length; i += STREAM_CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + STREAM_CONCURRENCY).map(async (a) => {
        try {
          const h = await fetchHrHistogram(a.external_id!);
          const { error: upErr } = await supabase
            .from("activities")
            .update({ hr_hist_min: h?.min ?? null, hr_hist: h?.counts ?? [] })
            .eq("id", a.id);
          if (upErr) throw upErr;
          filled++;
        } catch (err) {
          console.error("[sync] HR stream failed:", err instanceof Error ? err.message : err);
        }
      }),
    );
  }
  return filled;
}

/** Run details (splits, drift, laps) fetched per sync: newest first, history backfills. */
export const RUN_DETAILS_PER_SYNC = 10;

/**
 * Splits, HR drift and laps for Garmin runs that don't have them yet. A run
 * without streams is stored as `{}` so it isn't fetched again; a failed
 * request is retried on the next sync.
 */
export async function fillRunDetails(supabase: DB, limit = RUN_DETAILS_PER_SYNC): Promise<number> {
  const { data, error } = await supabase
    .from("activities")
    .select("id, external_id")
    .eq("source", "garmin")
    .eq("type", "run")
    .not("external_id", "is", null)
    .is("run_detail", null)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  let filled = 0;
  const todo = data ?? [];
  for (let i = 0; i < todo.length; i += STREAM_CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + STREAM_CONCURRENCY).map(async (a) => {
        try {
          const d = await fetchRunDetail(a.external_id!);
          const { error: upErr } = await supabase
            .from("activities")
            .update({ run_detail: (d ?? {}) as Json })
            .eq("id", a.id);
          if (upErr) throw upErr;
          filled++;
        } catch (err) {
          console.error("[sync] run detail failed:", err instanceof Error ? err.message : err);
        }
      }),
    );
  }
  return filled;
}

/** Wellness days re-read each sync (late Garmin uploads), and on the first run. */
export const WELLNESS_DAYS = 14;
export const WELLNESS_FIRST_DAYS = 120;

/** Upserts Garmin wellness (HRV, resting HR, sleep…) for the recent days; returns the days stored. */
export async function syncWellness(supabase: DB, userId: string, today: string): Promise<number> {
  const { count, error } = await supabase.from("wellness").select("date", { count: "exact", head: true });
  if (error) throw error;
  const days = await fetchWellness(addDays(today, -(count ? WELLNESS_DAYS : WELLNESS_FIRST_DAYS)), today);
  if (days.length === 0) return 0;
  const { error: upErr } = await supabase
    .from("wellness")
    .upsert(days.map((d) => ({ ...d, user_id: userId, updated_at: new Date().toISOString() })), {
      onConflict: "user_id,date",
    });
  if (upErr) throw upErr;
  return days.length;
}

/** Days of history behind the median RPE of unrated sessions (as on the Stats page). */
export const RPE_HISTORY_DAYS = 112;

/**
 * Done load by type and time in zones for the given Mondays (sorted).
 * Shared by the Season page and the Week View.
 */
export async function loadWeeks(
  supabase: DB,
  athlete: Athlete,
  weeks: string[],
  today: string,
): Promise<{ loads: Map<string, WeekLoad>; zones: Map<string, ZoneWeek> }> {
  if (!weeks.length) return { loads: new Map(), zones: new Map() };
  const first = weeks[0];
  const last = addDays(weeks.at(-1)!, 6);
  const to = last < today ? last : today;
  const from = [first, addDays(today, -RPE_HISTORY_DAYS)].sort()[0];
  const [inputs, zoned] = await Promise.all([
    loadInputs(supabase, from, to),
    supabase
      .from("activities")
      .select("date, type, hr_hist_min, hr_hist")
      .in("type", ["run", "cross"])
      .gte("date", first)
      .lte("date", to),
  ]);
  const loads = weeklyLoads(sessionLoads(inputs, athlete.anchors), weeks);
  const zones = weeklyZones(zoned.data ?? [], athlete.anchors, weeks, mondayOf);
  return {
    loads: new Map(loads.map((w) => [w.week, w])),
    zones: new Map(zones.map((w) => [w.week, w])),
  };
}

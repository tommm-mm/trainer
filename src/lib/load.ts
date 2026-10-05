// Planned load (sRPE) for a season week. Pure: no DB, no clock.
//
// A season week holds targets (km, runs, quality sessions, gym, bike/swim),
// not minutes, so its load is estimated from your own recent sessions:
//   run   = km × your easy pace × your easy RPE
//           + per quality session, 25′ at RPE 7 instead of easy
//   gym   = sessions × your usual minutes × your usual RPE (× 0.6 in a lighter week)
//   HIIT  = your usual weekly HIIT load (half in a lighter week, none without gym)
//   bike  = sessions × your usual minutes × your usual RPE
// A coach (or you) can set `load_target` on a week; it wins over the estimate.
// The calibration is refreshed on every Garmin sync and stored in
// `athlete_settings`, so the app and the SQL views use the same numbers.

import { addDays, mondayOf } from "@/lib/dates";
import {
  isEasyRun,
  LOAD_TYPES,
  median,
  medianRpeByType,
  sessionRpe,
  type ActivityInput,
  type ByType,
  type HrAnchors,
} from "@/lib/metrics";
import type { WeekTargets } from "@/lib/season/model";

export type LoadCalibration = {
  easy_min_per_km: number;
  easy_rpe: number;
  gym_min: number;
  gym_rpe: number;
  cross_min: number;
  cross_rpe: number;
  /** Average weekly HIIT load (AU) over the window. */
  hiit_week: number;
  /** Complete weeks the numbers come from (0 = all defaults). */
  weeks: number;
};

/** Used for any number with fewer than CALIBRATION_MIN_SAMPLES sessions behind it. */
export const DEFAULT_CALIBRATION: LoadCalibration = {
  easy_min_per_km: 6.3,
  easy_rpe: 4,
  gym_min: 70,
  gym_rpe: 6,
  cross_min: 40,
  cross_rpe: 3,
  hiit_week: 0,
  weeks: 0,
};

export const CALIBRATION_WEEKS = 6;
export const CALIBRATION_MIN_SAMPLES = 2;
/** A quality session: about this many minutes at this RPE instead of easy running. */
export const QUALITY_HARD_MIN = 25;
export const QUALITY_RPE = 7;
/** Lighter week = gym deload (half the sets, RIR 3–4): shorter and easier. */
export const DELOAD_GYM_FACTOR = 0.6;
export const DELOAD_HIIT_FACTOR = 0.5;

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Your usual session numbers over the last `weeks` complete ISO weeks before
 * `today`. `activities` should include unlinked logged workouts as gym
 * sessions (see `unlinkedWorkoutActivities`) and may reach further back:
 * older rows still feed the median RPE used for unrated sessions.
 */
export function calibrateLoad(
  activities: ActivityInput[],
  anchors: HrAnchors,
  today: string,
  weeks = CALIBRATION_WEEKS,
): LoadCalibration {
  const to = addDays(mondayOf(today), -1);
  const from = addDays(mondayOf(today), -7 * weeks);
  const medians = medianRpeByType(activities);
  const inWindow = activities.filter((a) => a.date >= from && a.date <= to && (a.duration_min ?? 0) > 0);
  const rpe = (a: ActivityInput) => sessionRpe(a, anchors, medians).rpe;
  const pick = (values: number[], fallback: number, digits: number) =>
    values.length >= CALIBRATION_MIN_SAMPLES ? round(median(values)!, digits) : fallback;

  const easy = inWindow.filter((a) => isEasyRun(a, anchors));
  const gym = inWindow.filter((a) => a.type === "gym");
  const cross = inWindow.filter((a) => a.type === "cross");
  const hiit = inWindow.filter((a) => a.type === "cardio");
  const d = DEFAULT_CALIBRATION;
  const used = new Set(inWindow.map((a) => mondayOf(a.date))).size;

  return {
    easy_min_per_km: pick(easy.map((a) => a.duration_min! / a.distance_km!), d.easy_min_per_km, 2),
    easy_rpe: pick(easy.map(rpe), d.easy_rpe, 1),
    gym_min: pick(gym.map((a) => a.duration_min!), d.gym_min, 0),
    gym_rpe: pick(gym.map(rpe), d.gym_rpe, 1),
    cross_min: pick(cross.map((a) => a.duration_min!), d.cross_min, 0),
    cross_rpe: pick(cross.map(rpe), d.cross_rpe, 1),
    hiit_week: used ? Math.round(hiit.reduce((s, a) => s + a.duration_min! * rpe(a), 0) / weeks) : 0,
    weeks: used,
  };
}

export type LoadEstimate = ByType & { total: number };

/** Estimated load of a week's targets, by type (whole AU). */
export function estimateWeekLoad(w: WeekTargets, c: LoadCalibration): LoadEstimate {
  const km = w.run_km ?? 0;
  const quality = w.quality_sessions ?? 0;
  const gymSessions = w.gym_sessions ?? 0;
  const run =
    km * c.easy_min_per_km * c.easy_rpe + quality * QUALITY_HARD_MIN * Math.max(0, QUALITY_RPE - c.easy_rpe);
  const gym = gymSessions * c.gym_min * c.gym_rpe * (w.is_deload ? DELOAD_GYM_FACTOR : 1);
  const hiit = gymSessions > 0 ? c.hiit_week * (w.is_deload ? DELOAD_HIIT_FACTOR : 1) : 0;
  const cross = (w.cross_sessions ?? 0) * c.cross_min * c.cross_rpe;
  const out = { run: Math.round(run), gym: Math.round(gym), hiit: Math.round(hiit), cross: Math.round(cross) };
  return { ...out, total: LOAD_TYPES.reduce((s, t) => s + out[t], 0) };
}

export type PlannedLoad = {
  /** What the week is judged against: the coach's target if set, else the estimate. */
  total: number;
  source: "target" | "estimate";
  estimate: LoadEstimate;
};

export function plannedLoad(w: WeekTargets, c: LoadCalibration): PlannedLoad {
  const estimate = estimateWeekLoad(w, c);
  return w.load_target != null
    ? { total: w.load_target, source: "target", estimate }
    : { total: estimate.total, source: "estimate", estimate };
}

/** Done vs planned: within ±10% counts as on plan (load is noisier than km). */
export const LOAD_TOLERANCE = 0.1;

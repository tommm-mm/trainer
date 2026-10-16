// Training metrics, computed from `activities` rows. Pure functions only:
// no DB, no clock (callers pass `today`), so the Stats page and the AI coach
// (Phase D) get exactly the same numbers from the same inputs.
//
// Units: load is in arbitrary units (AU) = minutes × RPE (Foster's sRPE).
// Weeks are ISO weeks (Mon–Sun), like the rest of the app. Days without a
// session count as load 0 (that is what makes monotony meaningful).

import type { Tables } from "@/lib/database.types";
import { addDays, daysBetween, mondayOf } from "@/lib/dates";

export type ActivityInput = Pick<
  Tables<"activities">,
  "date" | "type" | "distance_km" | "duration_min" | "avg_hr" | "max_hr" | "rpe"
>;

// ---------------------------------------------------------------- HR anchors

/** Resting HR used when intervals.icu has no wellness data (user-reported). */
export const DEFAULT_REST_HR = 46;
/** Max HR never goes below this: highest seen (192, 19 Jun 2026; an all-out 5 km peaked at 187), confirmed by Tommaso 16 Oct. Observed peaks can raise it. */
export const MAX_HR_FLOOR = 192;

export type HrAnchors = {
  rest: number;
  max: number;
  restSource: "garmin" | "default";
  maxSource: "garmin" | "observed" | "default";
};

/**
 * Picks the resting/max HR used by the HR-based estimates.
 * Max = highest of the floor, the intervals.icu setting and any HR seen in a
 * session (a real effort can only prove max is higher, never lower).
 */
export function resolveHrAnchors(input: {
  garminRest?: number | null;
  garminMax?: number | null;
  activities: Pick<ActivityInput, "max_hr">[];
}): HrAnchors {
  const observed = Math.max(0, ...input.activities.map((a) => a.max_hr ?? 0));
  const garminMax = input.garminMax ?? 0;
  let max = MAX_HR_FLOOR;
  let maxSource: HrAnchors["maxSource"] = "default";
  if (garminMax > max) {
    max = garminMax;
    maxSource = "garmin";
  }
  if (observed > max) {
    max = observed;
    maxSource = "observed";
  }
  const rest = input.garminRest && input.garminRest > 25 && input.garminRest < max
    ? input.garminRest
    : null;
  return {
    rest: rest ?? DEFAULT_REST_HR,
    max,
    restSource: rest ? "garmin" : "default",
    maxSource,
  };
}

/** Heart-rate reserve fraction (Karvonen): 0 = resting, 1 = max. Clamped. */
export function hrReserve(avgHr: number, a: Pick<HrAnchors, "rest" | "max">): number {
  return clamp((avgHr - a.rest) / (a.max - a.rest), 0, 1);
}

/**
 * RPE (CR-10) estimated from average HR as % of heart-rate reserve:
 * RPE ≈ 15 × HRR − 6 → 50% ≈ 2, 60% ≈ 3, 70% ≈ 4.5, 80% ≈ 6, 90% ≈ 7.5.
 * Only meaningful for steady endurance work — strength HR understates effort.
 */
export function rpeFromHr(avgHr: number, a: Pick<HrAnchors, "rest" | "max">): number {
  return clamp(Math.round(15 * hrReserve(avgHr, a) - 6), 1, 10);
}

// ---------------------------------------------------------------- session load

/** Used when there is no RPE, no usable HR and no rated session of that type. */
export const DEFAULT_RPE = 5;

export type RpeSource = "entered" | "hr" | "median" | "default";

export type SessionLoad = {
  date: string;
  type: string;
  minutes: number;
  rpe: number;
  rpeSource: RpeSource;
  load: number;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median entered RPE per activity type ("run", "gym"). */
export function medianRpeByType(activities: ActivityInput[]): Record<string, number> {
  const byType: Record<string, number[]> = {};
  for (const a of activities) {
    if (a.rpe != null) (byType[a.type] ??= []).push(a.rpe);
  }
  const out: Record<string, number> = {};
  for (const [type, list] of Object.entries(byType)) out[type] = median(list)!;
  return out;
}

/**
 * RPE of one session, tiered when it wasn't entered:
 *   1. entered — the RPE from the feedback card / log form
 *   2. hr      — runs and bike/swim with avg HR: estimated from % heart-rate reserve
 *   3. median  — your median entered RPE for that type (gym, or no HR)
 *   4. default — DEFAULT_RPE
 */
export function sessionRpe(
  a: ActivityInput,
  anchors: HrAnchors,
  medians: Record<string, number>,
): { rpe: number; rpeSource: RpeSource } {
  if (a.rpe != null) return { rpe: a.rpe, rpeSource: "entered" };
  if ((a.type === "run" || a.type === "cross") && a.avg_hr) {
    return { rpe: rpeFromHr(a.avg_hr, anchors), rpeSource: "hr" };
  }
  if (medians[a.type] != null) return { rpe: medians[a.type], rpeSource: "median" };
  return { rpe: DEFAULT_RPE, rpeSource: "default" };
}

/**
 * sRPE per session = duration_min × RPE (see `sessionRpe` for missing RPE).
 * Sessions without a duration carry no load and are dropped.
 */
export function sessionLoads(activities: ActivityInput[], anchors: HrAnchors): SessionLoad[] {
  const medians = medianRpeByType(activities);
  const out: SessionLoad[] = [];
  for (const a of activities) {
    const minutes = a.duration_min ?? 0;
    if (minutes <= 0) continue;
    const { rpe, rpeSource } = sessionRpe(a, anchors, medians);
    out.push({ date: a.date, type: a.type, minutes, rpe, rpeSource, load: minutes * rpe });
  }
  return out;
}

/** Share of total load (0–1) whose RPE was estimated rather than entered. */
export function estimatedLoadShare(sessions: SessionLoad[]): number | null {
  const total = sum(sessions.map((s) => s.load));
  if (total === 0) return null;
  return sum(sessions.filter((s) => s.rpeSource !== "entered").map((s) => s.load)) / total;
}

// ---------------------------------------------------------------- load by type

/**
 * Load buckets: run, gym (strength), HIIT (Garmin "cardio" finishers) and
 * bike/swim ("cross"). Fatigue adds up from all of them; impact only from runs.
 */
export const LOAD_TYPES = ["run", "gym", "hiit", "cross"] as const;
export type LoadType = (typeof LOAD_TYPES)[number];

export const LOAD_TYPE_LABELS: Record<LoadType, string> = {
  run: "Run",
  gym: "Gym",
  hiit: "HIIT",
  cross: "Bike/swim",
};

/** Activity type → load bucket. Anything unknown counts with the gym. */
export function loadType(activityType: string): LoadType {
  if (activityType === "run") return "run";
  if (activityType === "cardio") return "hiit";
  if (activityType === "cross") return "cross";
  return "gym";
}

export type ByType = Record<LoadType, number>;
export const emptyByType = (): ByType => ({ run: 0, gym: 0, hiit: 0, cross: 0 });

// ---------------------------------------------------------------- daily load

export type DailyLoad = { date: string; total: number } & ByType;

/** One row per calendar day from `from` to `to` inclusive; rest days are 0. */
export function dailyLoads(sessions: SessionLoad[], from: string, to: string): DailyLoad[] {
  const n = daysBetween(from, to) + 1;
  const days: DailyLoad[] = Array.from({ length: Math.max(0, n) }, (_, i) => ({
    date: addDays(from, i),
    ...emptyByType(),
    total: 0,
  }));
  for (const s of sessions) {
    const i = daysBetween(from, s.date);
    if (i < 0 || i >= days.length) continue;
    days[i][loadType(s.type)] += s.load;
    days[i].total += s.load;
  }
  return days;
}

// ---------------------------------------------------------------- weekly load

export type WeekLoad = ByType & {
  week: string; // Monday
  total: number;
  /** Share of the week's load whose RPE was estimated (0–1), null with no load. */
  estimatedShare: number | null;
};

/** Load per ISO week and type for the given Mondays (rounded to whole AU). */
export function weeklyLoads(sessions: SessionLoad[], weeks: string[]): WeekLoad[] {
  const byWeek = new Map(weeks.map((w) => [w, [] as SessionLoad[]]));
  for (const s of sessions) byWeek.get(mondayOf(s.date))?.push(s);
  return weeks.map((week) => {
    const list = byWeek.get(week)!;
    const t = emptyByType();
    for (const s of list) t[loadType(s.type)] += s.load;
    for (const k of LOAD_TYPES) t[k] = Math.round(t[k]);
    return {
      week,
      ...t,
      total: t.run + t.gym + t.hiit + t.cross,
      estimatedShare: estimatedLoadShare(list),
    };
  });
}

// ---------------------------------------------------------------- ACWR

export type AcwrPoint = {
  date: string;
  acute: number; // 7-day load
  chronic: number; // 28-day load ÷ 4 (average week)
  ratio: number | null;
};

/** Sweet spot from Gabbett (2016): below = undertraining, above = spike. */
export const ACWR_SAFE = { low: 0.8, high: 1.3 } as const;

/**
 * Daily ACWR = 7-day load ÷ (28-day load ÷ 4), rolling averages ("coupled":
 * the 28 days include the last 7). `daily` must be contiguous and sorted.
 * `ratio` is null until 28 days of history exist (before `historyStart`
 * missing data would look like rest) and when the chronic load is 0.
 */
export function acwrSeries(daily: DailyLoad[], historyStart: string | null): AcwrPoint[] {
  const out: AcwrPoint[] = [];
  for (let i = 0; i < daily.length; i++) {
    const acute = sum(daily.slice(Math.max(0, i - 6), i + 1).map((d) => d.total));
    const chronic = sum(daily.slice(Math.max(0, i - 27), i + 1).map((d) => d.total)) / 4;
    const date = daily[i].date;
    const enoughHistory =
      i >= 27 && historyStart !== null && daysBetween(historyStart, date) >= 27;
    out.push({
      date,
      acute,
      chronic,
      ratio: enoughHistory && chronic > 0 ? acute / chronic : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- monotony & strain

export type MonotonyWeek = {
  week: string; // Monday
  load: number;
  mean: number;
  sd: number;
  monotony: number | null;
  strain: number | null;
  days: number; // days counted (< 7 for the current week)
};

/** Foster: above 2.0 = too little variation between hard and easy days. */
export const MONOTONY_HIGH = 2;

/**
 * Foster's training monotony = mean daily load ÷ SD of daily load (population
 * SD) over a set of days; strain = total load × monotony. Null when SD is 0
 * (every day identical, e.g. a full rest week).
 */
export function monotony(loads: number[]): Omit<MonotonyWeek, "week"> {
  const load = sum(loads);
  const mean = loads.length ? load / loads.length : 0;
  const sd = Math.sqrt(
    loads.length ? sum(loads.map((l) => (l - mean) ** 2)) / loads.length : 0,
  );
  const mono = sd > 0 ? mean / sd : null;
  return {
    load,
    mean,
    sd,
    monotony: mono,
    strain: mono === null ? null : load * mono,
    days: loads.length,
  };
}

/** Monotony/strain per ISO week. The week containing `today` only counts days up to today. */
export function weeklyMonotony(daily: DailyLoad[], today: string): MonotonyWeek[] {
  const weeks = new Map<string, number[]>();
  for (const d of daily) {
    if (d.date > today) continue;
    const w = mondayOf(d.date);
    if (!weeks.has(w)) weeks.set(w, []);
    weeks.get(w)!.push(d.total);
  }
  return [...weeks.entries()].map(([week, loads]) => ({ week, ...monotony(loads) }));
}

// ---------------------------------------------------------------- running volume

export type RunningWeek = {
  week: string; // Monday
  km: number;
  runs: number;
  longestKm: number;
  /** longest run ÷ weekly km (0–1), null with no running. */
  longRunShare: number | null;
};

/** Long run guideline: 30–35% of weekly volume. */
export const LONG_RUN_SHARE = { low: 0.3, high: 0.35 } as const;
/** Below this weekly volume the long-run share isn't meaningful (one run = 100%). */
export const LONG_RUN_MIN_WEEK_KM = 15;

/** The last `weeks` ISO weeks ending with the week of `today`, oldest first. */
export function weekStarts(today: string, weeks: number): string[] {
  const current = mondayOf(today);
  return Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
}

export function weeklyRunning(
  activities: ActivityInput[],
  today: string,
  weeks: number,
): RunningWeek[] {
  const rows = new Map<string, RunningWeek>(
    weekStarts(today, weeks).map((w) => [
      w,
      { week: w, km: 0, runs: 0, longestKm: 0, longRunShare: null },
    ]),
  );
  for (const a of activities) {
    if (a.type !== "run" || !a.distance_km) continue;
    const row = rows.get(mondayOf(a.date));
    if (!row) continue;
    row.km += a.distance_km;
    row.runs += 1;
    row.longestKm = Math.max(row.longestKm, a.distance_km);
  }
  for (const row of rows.values()) {
    row.longRunShare = row.km > 0 ? row.longestKm / row.km : null;
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------- aerobic trend (easy runs)

/** An unrated run counts as easy at or below this share of heart-rate reserve. */
export const EASY_MAX_HRR = 0.75;
/** A rated run counts as easy at or below this RPE. */
export const EASY_MAX_RPE = 4;
/** Reference intensity for "pace at HR": 65% of heart-rate reserve. */
export const REFERENCE_HRR = 0.65;

export function isEasyRun(a: ActivityInput, anchors: HrAnchors): boolean {
  if (a.type !== "run" || !a.avg_hr || !a.distance_km || !a.duration_min) return false;
  if (a.rpe != null) return a.rpe <= EASY_MAX_RPE;
  return hrReserve(a.avg_hr, anchors) <= EASY_MAX_HRR;
}

/** The HR used for "pace at HR", derived from the anchors (≈ easy-run HR). */
export function referenceHr(anchors: Pick<HrAnchors, "rest" | "max">): number {
  return Math.round(anchors.rest + REFERENCE_HRR * (anchors.max - anchors.rest));
}

/**
 * Efficiency Factor (Friel) = speed in metres/min ÷ avg HR.
 * Higher = more distance per heartbeat = better aerobic fitness.
 */
export function efficiencyFactor(distanceKm: number, durationMin: number, avgHr: number): number {
  return (distanceKm * 1000) / durationMin / avgHr;
}

/**
 * Pace (sec/km) you'd run at `refHr`, assuming speed scales with heart-rate
 * *reserve* (HR above resting), not raw HR: scaling by raw HR ignores the
 * resting offset and makes slower runs look falsely inefficient.
 * A readable normalisation for trends, not a race prediction.
 */
export function paceAtHr(
  distanceKm: number,
  durationMin: number,
  avgHr: number,
  refHr: number,
  restHr: number,
): number | null {
  if (avgHr <= restHr || refHr <= restHr) return null;
  const speed = (distanceKm * 1000) / durationMin; // m/min
  const speedAtRef = (speed * (refHr - restHr)) / (avgHr - restHr);
  return (1000 / speedAtRef) * 60;
}

export type AerobicWeek = {
  week: string;
  easyRuns: number;
  avgHr: number | null; // duration-weighted
  ef: number | null; // duration-weighted
  paceAtRefHr: number | null; // sec/km
};

export function weeklyAerobic(
  activities: ActivityInput[],
  anchors: HrAnchors,
  today: string,
  weeks: number,
): AerobicWeek[] {
  const refHr = referenceHr(anchors);
  const buckets = new Map<string, ActivityInput[]>(
    weekStarts(today, weeks).map((w) => [w, []]),
  );
  for (const a of activities) {
    if (isEasyRun(a, anchors)) buckets.get(mondayOf(a.date))?.push(a);
  }
  return [...buckets.entries()].map(([week, runs]) => {
    const minutes = sum(runs.map((r) => r.duration_min!));
    if (runs.length === 0 || minutes === 0) {
      return { week, easyRuns: 0, avgHr: null, ef: null, paceAtRefHr: null };
    }
    const w = (f: (r: ActivityInput) => number) =>
      sum(runs.map((r) => f(r) * r.duration_min!)) / minutes;
    // Duration-weighted mean speed at the reference HR, turned back into pace.
    const speedAtRef = w((r) => {
      const pace = paceAtHr(r.distance_km!, r.duration_min!, r.avg_hr!, refHr, anchors.rest);
      return pace === null ? 0 : 60_000 / pace;
    });
    return {
      week,
      easyRuns: runs.length,
      avgHr: w((r) => r.avg_hr!),
      ef: w((r) => efficiencyFactor(r.distance_km!, r.duration_min!, r.avg_hr!)),
      paceAtRefHr: speedAtRef > 0 ? 60_000 / speedAtRef : null,
    };
  });
}

// ---------------------------------------------------------------- summary (for the coach)

export type TrainingSummary = {
  today: string;
  anchors: HrAnchors;
  acwr: number | null;
  acuteLoad: number;
  chronicLoad: number;
  monotony7d: number | null;
  strain7d: number | null;
  weekKm: number;
  estimatedLoadShare: number | null;
};

/** Headline numbers as of `today` — what the Stats header and the AI coach read. */
export function trainingSummary(
  activities: ActivityInput[],
  anchors: HrAnchors,
  today: string,
): TrainingSummary {
  const sessions = sessionLoads(activities, anchors);
  const historyStart = earliestDate(activities);
  const from = addDays(today, -27);
  const daily = dailyLoads(sessions, from, today);
  const last = acwrSeries(daily, historyStart).at(-1)!;
  const m = monotony(daily.slice(-7).map((d) => d.total));
  const [week] = weeklyRunning(activities, today, 1);
  return {
    today,
    anchors,
    acwr: last.ratio,
    acuteLoad: last.acute,
    chronicLoad: last.chronic,
    monotony7d: m.monotony,
    strain7d: m.strain,
    weekKm: week.km,
    estimatedLoadShare: estimatedLoadShare(sessions.filter((s) => s.date >= from && s.date <= today)),
  };
}

// ---------------------------------------------------------------- trends

/**
 * Trailing moving average. Nulls are skipped; a point needs at least half the
 * window filled, otherwise it's null (no trend from one lonely value).
 */
export function rollingMean(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values
      .slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => v !== null);
    return slice.length >= Math.ceil(window / 2) ? sum(slice) / slice.length : null;
  });
}

export type LinearFit = {
  /** Change per step (per week for weekly series). */
  slope: number;
  intercept: number;
  /** Fitted value at every index (so the line spans the whole chart). */
  fitted: number[];
  points: number;
};

/** Least-squares straight line through the non-null points; null with < 3 points. */
export function linearFit(values: (number | null)[]): LinearFit | null {
  const pts = values
    .map((y, x) => ({ x, y }))
    .filter((p): p is { x: number; y: number } => p.y !== null);
  if (pts.length < 3) return null;
  const mx = sum(pts.map((p) => p.x)) / pts.length;
  const my = sum(pts.map((p) => p.y)) / pts.length;
  const sxx = sum(pts.map((p) => (p.x - mx) ** 2));
  if (sxx === 0) return null;
  const slope = sum(pts.map((p) => (p.x - mx) * (p.y - my))) / sxx;
  const intercept = my - slope * mx;
  return {
    slope,
    intercept,
    fitted: values.map((_, x) => intercept + slope * x),
    points: pts.length,
  };
}

/** True when `week` (a Monday) is fully in the past as of `today`. */
export function isCompleteWeek(week: string, today: string): boolean {
  return addDays(week, 6) < today;
}

// ---------------------------------------------------------------- helpers

export function earliestDate(rows: { date: string }[]): string | null {
  let min: string | null = null;
  for (const r of rows) if (min === null || r.date < min) min = r.date;
  return min;
}

function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

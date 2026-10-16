// Marathon prediction toward the goal race. Pure: runs in, numbers out.
//
// Three estimates, shown side by side (the approach of Runalyze, on Daniels' formulas):
//   1. Race anchor   the most recent race-like effort of the last 12 months
//                    (planned as a race / time trial / test, named like a race, or
//                    at race heart rate for its duration) → VDOT (Daniels–Gilbert)
//                    → its marathon equivalent. The best one is shown as context.
//   2. Fitness       every easy run with heart rate gives a VDOT: the oxygen cost
//                    of its pace (Daniels) over the share of VO₂ reserve its HR
//                    reserve stands for (Swain: %VO₂R ≈ %HRR). Easy runs only
//                    (60–78 % HRR) and the median of the last 6 weeks: HR-based
//                    VDOT reads ~15 % low on easy running and right on hard
//                    efforts (his data, 16 Oct: 34–38 easy vs 45.8 on a hard
//                    5 km), so mixing them would track the training mix, not
//                    fitness. Calibrated on the anchor: race VDOT ÷ the same
//                    median in the 6 weeks before the race. No anchor → no fitness time.
//   3. Marathon shape  endurance vs what the target needs: weekly km and the
//                    longest run of the last 6 weeks. A heuristic (documented
//                    below): shape < 100 % lowers the VDOT used for the marathon.
// Prediction = fitness VDOT (else the anchor) × shape factor → marathon time;
// range = ± the typical error of race-equivalence predictions (3 %) combined with
// the noise of the easy-run median; trend = vs 4 weeks ago.

import { addDays } from "@/lib/dates";

export type RunInput = {
  date: string;
  name: string | null;
  distance_km: number;
  duration_min: number;
  avg_hr: number | null;
  /** The plan called this day a race / time trial / test (the coach scheduled it). */
  planned_test?: boolean;
};

export type HrAnchorsLite = { rest: number; max: number };

export const MARATHON_M = 42195;

// ---- Daniels–Gilbert -------------------------------------------------------

/** VO₂ (ml/kg/min) to run at `v` m/min (Daniels & Gilbert 1979). */
export function vo2AtSpeed(v: number): number {
  return -4.6 + 0.182258 * v + 0.000104 * v * v;
}

/** Share of VO₂max sustainable for `t` minutes (Daniels & Gilbert 1979). */
export function vo2maxShare(t: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
}

/** VDOT of a race: `meters` in `seconds`. */
export function vdotFromRace(meters: number, seconds: number): number {
  const t = seconds / 60;
  return vo2AtSpeed(meters / t) / vo2maxShare(t);
}

/** Race time (s) for `meters` at `vdot` (bisection on the Daniels–Gilbert curve). */
export function raceTime(vdot: number, meters: number): number {
  let lo = 60;
  let hi = 60 * 60 * 12;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (vdotFromRace(meters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// ---- Runs -------------------------------------------------------------------

const VO2_REST = 3.5;

/** Runs that can carry an HR-based VDOT: ≥ 3 km, ≥ 15′, plausible pace, HR reserve 50–97 %. */
export function hrRunVdot(r: RunInput, a: HrAnchorsLite): number | null {
  if (!r.avg_hr || r.distance_km < 3 || r.duration_min < 15) return null;
  const v = (r.distance_km * 1000) / r.duration_min;
  if (v < 120 || v > 400) return null; // slower than 8:20/km or faster than 2:30/km
  const hrr = (r.avg_hr - a.rest) / (a.max - a.rest);
  if (hrr < 0.5 || hrr > 0.97) return null;
  return (vo2AtSpeed(v) - VO2_REST) / hrr + VO2_REST;
}

const RACE_NAME = /\b(gara|race|half|mezza|maratona|marathon|maratonina|10 ?k|5 ?k|21 ?k|parkrun|time ?trial|tt)\b/i;
/** A planned test only counts when run at least this hard (his 16 Oct 5 km TT: 88 %). */
export const PLANNED_TEST_MIN_HRR = 0.8;
/** HR-detected races: HR reserve at least Daniels' sustainable share for that duration minus this. */
export const RACE_HRR_MARGIN = 0.04;

/**
 * Race-like: planned as a race / time trial / test, named like a race, or run at the heart rate a race of that duration takes
 * (%HRR ≈ %VO₂R ≥ Daniels' sustainable %VO₂max − 4 points: ≥ 90 % for 24′, ≥ 81 % for 1:39).
 * A hard 5 km tempo at 87 % HRR is not a 5 km race.
 */
export function isRaceLike(r: RunInput, a: HrAnchorsLite): boolean {
  const hrr = r.avg_hr ? (r.avg_hr - a.rest) / (a.max - a.rest) : null;
  // Planned: trust the plan, unless the HR shows it wasn't run hard (a note's "test" on an easy day).
  if (r.planned_test && (hrr === null || hrr >= PLANNED_TEST_MIN_HRR)) return true;
  if (r.name && RACE_NAME.test(r.name)) return true;
  if (hrr === null) return false;
  return hrr >= vo2maxShare(r.duration_min) - RACE_HRR_MARGIN;
}

/**
 * A plan row that schedules a race, time trial or test (session type or the coach's notes).
 * Threshold tests (30′ for the HR zones) aren't race efforts: excluded.
 */
const PLANNED_TEST = /time[ -]?trial|\btt\b|\brace\b|\bgara\b|\btest\b/i;
const THRESHOLD = /threshold|soglia|lthr/i;
export function isPlannedTest(p: { session_type: string; notes: string | null }): boolean {
  const text = `${p.session_type} ${p.notes ?? ""}`;
  return PLANNED_TEST.test(text) && !THRESHOLD.test(text);
}

export type Anchor = { date: string; name: string | null; km: number; seconds: number; vdot: number; marathon: number };

/**
 * Race-like efforts (≥ 5 km) in the window, as anchors, oldest first. The prediction uses the most
 * recent one: fitness moves (his 16 Oct 5 km TT read VDOT 41 vs 45.7 for the March half), so the
 * newest test is the truth; the best of the 12 months is shown as context.
 */
export function raceAnchors(runs: RunInput[], a: HrAnchorsLite, from: string, to: string): Anchor[] {
  const out: Anchor[] = [];
  for (const r of runs) {
    if (r.date < from || r.date > to || r.distance_km < 5 || r.duration_min <= 0) continue;
    if (!isRaceLike(r, a)) continue;
    const seconds = r.duration_min * 60;
    const vdot = vdotFromRace(r.distance_km * 1000, seconds);
    if (!Number.isFinite(vdot) || vdot < 25 || vdot > 85) continue;
    out.push({ date: r.date, name: r.name, km: r.distance_km, seconds, vdot, marathon: raceTime(vdot, MARATHON_M) });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** The most recent race-like effort in the window (see `raceAnchors`). */
export function findAnchor(runs: RunInput[], a: HrAnchorsLite, from: string, to: string): Anchor | null {
  return raceAnchors(runs, a, from, to).at(-1) ?? null;
}

export type Fitness = { vdot: number; sd: number; runs: number };

/** Easy running: where HR-based VDOT is comparable from run to run. */
export const EASY_HRR: [number, number] = [0.6, 0.72];

/** Median (and SD) of the HR-based VDOT of easy runs in the window; null under 3 runs. */
export function fitnessIn(runs: RunInput[], a: HrAnchorsLite, from: string, to: string, exclude?: string): Fitness | null {
  const vs = runs
    .filter((r) => r.date >= from && r.date <= to && r.date !== exclude && r.avg_hr)
    .filter((r) => {
      const hrr = (r.avg_hr! - a.rest) / (a.max - a.rest);
      return hrr >= EASY_HRR[0] && hrr <= EASY_HRR[1];
    })
    .map((r) => hrRunVdot(r, a))
    .filter((v): v is number => v !== null)
    .sort((x, y) => x - y);
  if (vs.length < 3) return null;
  const mid = vs.length / 2;
  const median = vs.length % 2 ? vs[Math.floor(mid)] : (vs[mid - 1] + vs[mid]) / 2;
  const mean = vs.reduce((s, v) => s + v, 0) / vs.length;
  const sd = Math.sqrt(vs.reduce((s, v) => s + (v - mean) ** 2, 0) / (vs.length - 1));
  return { vdot: median, sd, runs: vs.length };
}

// ---- Shape ------------------------------------------------------------------

/** What a 3:30-ish marathon needs (Pfitzinger 18/55-style peak): editable here. */
export const SHAPE_TARGET = { weeklyKm: 60, longRunKm: 30 };
/** At 0 % shape the marathon VDOT drops by this share (heuristic: ~+20′ at VDOT 45). */
export const SHAPE_MAX_PENALTY = 0.1;

export type Shape = { weeklyKm: number; longRunKm: number; pct: number };

/** Endurance over the last 6 weeks: ⅔ weekly km, ⅓ longest run, each capped at the target. */
export function marathonShape(runs: RunInput[], to: string, days = 42): Shape {
  const from = addDays(to, -(days - 1));
  const inWin = runs.filter((r) => r.date >= from && r.date <= to);
  const weeklyKm = (inWin.reduce((s, r) => s + r.distance_km, 0) / days) * 7;
  const longRunKm = Math.max(0, ...inWin.map((r) => r.distance_km));
  const pct =
    (2 / 3) * Math.min(1, weeklyKm / SHAPE_TARGET.weeklyKm) +
    (1 / 3) * Math.min(1, longRunKm / SHAPE_TARGET.longRunKm);
  return { weeklyKm, longRunKm, pct };
}

// ---- Prediction ---------------------------------------------------------------

export type Prediction = {
  /** The most recent race-like effort: what the prediction is calibrated on. */
  anchor: Anchor | null;
  /** The best race-like effort of the 12 months, when it isn't the anchor (context). */
  best: Anchor | null;
  /** Calibrated fitness (VDOT), with the factor applied; null without an anchor to calibrate on. */
  fitness: (Fitness & { factor: number }) | null;
  shape: Shape;
  /** Marathon time if endurance were complete (fitness, else the anchor). */
  potential: number | null;
  /** Predicted marathon time today: potential with the shape penalty, and its range. */
  seconds: number | null;
  low: number | null;
  high: number | null;
  /** Seconds vs 4 weeks ago (negative = faster); null when either side is missing. */
  trend: number | null;
};

const FITNESS_DAYS = 42;
/** Typical error of a race-equivalence prediction (Daniels / Riegel tables, ± 2–5 %). */
export const PREDICTION_ERROR = 0.03;

function predictCore(runs: RunInput[], a: HrAnchorsLite, today: string): Omit<Prediction, "trend"> {
  const races = raceAnchors(runs, a, addDays(today, -365), today);
  const anchor = races.at(-1) ?? null;
  const top = races.reduce<Anchor | null>((b, r) => (!b || r.vdot > b.vdot ? r : b), null);
  const best = top && top !== anchor ? top : null;
  const shape = marathonShape(runs, today);
  let fitness: Prediction["fitness"] = null;
  if (anchor) {
    // Calibrate on the 6 weeks before the race (the race itself excluded).
    const before = fitnessIn(runs, a, addDays(anchor.date, -FITNESS_DAYS), addDays(anchor.date, -1), anchor.date);
    const now = fitnessIn(runs, a, addDays(today, -(FITNESS_DAYS - 1)), today, anchor.date);
    if (before && now) {
      const factor = anchor.vdot / before.vdot;
      fitness = { vdot: now.vdot * factor, sd: now.sd * factor, runs: now.runs, factor };
    }
  }
  const baseVdot = fitness?.vdot ?? anchor?.vdot ?? null;
  if (baseVdot === null) return { anchor, best, fitness, shape, potential: null, seconds: null, low: null, high: null };
  const adj = 1 - SHAPE_MAX_PENALTY * (1 - shape.pct);
  const seconds = raceTime(baseVdot * adj, MARATHON_M);
  // Relative error: race-equivalence error ⊕ standard error of the easy-run median.
  const noise = fitness ? fitness.sd / Math.sqrt(fitness.runs) / fitness.vdot : 0;
  const rel = Math.sqrt(PREDICTION_ERROR ** 2 + noise ** 2);
  return {
    anchor,
    best,
    fitness,
    shape,
    potential: raceTime(baseVdot, MARATHON_M),
    seconds,
    low: Math.round(seconds * (1 - rel)),
    high: Math.round(seconds * (1 + rel)),
  };
}

/**
 * The prediction on `today` and how it moved over the last 4 weeks. The trend uses today's
 * calibration on the easy runs and shape of 4 weeks ago (the factor belongs to the athlete,
 * not the date), so it shows as soon as there is an anchor, not 4 weeks after it.
 */
export function predictMarathon(runs: RunInput[], a: HrAnchorsLite, today: string): Prediction {
  const now = predictCore(runs, a, today);
  let trend: number | null = null;
  if (now.seconds !== null) {
    const past = addDays(today, -28);
    const shapeThen = marathonShape(runs, past);
    const fitThen = now.fitness
      ? fitnessIn(runs, a, addDays(past, -(FITNESS_DAYS - 1)), past, now.anchor?.date)
      : null;
    const vdotThen = now.fitness ? (fitThen ? fitThen.vdot * now.fitness.factor : null) : now.anchor?.vdot ?? null;
    if (vdotThen !== null) {
      const then = raceTime(vdotThen * (1 - SHAPE_MAX_PENALTY * (1 - shapeThen.pct)), MARATHON_M);
      trend = now.seconds - then;
    }
  }
  return { ...now, trend };
}

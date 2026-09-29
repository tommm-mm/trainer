// Strength metrics from logged workouts. Pure functions only (no DB, no
// clock), like metrics.ts: the Stats page, the Week View meters and the AI
// coach (Phase D) all read the same numbers from the same inputs.
//
// Definitions
// - Working set: not a warm-up.
// - Hard set: a working set of the main block (finishers are conditioning),
//   measured in reps, with ≥ 1 rep and RIR ≤ 4 (unrated counts as hard).
//   Sets far from failure add little hypertrophy stimulus.
// - Muscle volume: hard sets × 1 for each primary muscle, × 0.5 for each
//   secondary muscle ("fractional" counting, as in recent volume meta-analyses).
// - Tonnage: Σ weight × reps of working sets (bodyweight moves: added load only).

import type { ActivityInput } from "@/lib/metrics";
import { addDays, mondayOf } from "@/lib/dates";
import { linearFit, weekStarts } from "@/lib/metrics";

export const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
] as const;
export type Muscle = (typeof MUSCLES)[number];

/**
 * Weekly hard sets per muscle for hypertrophy. ≥ 10 sets grew more muscle than
 * fewer (Schoenfeld, Ogborn & Krieger 2017, J Sports Sci); returns flatten at
 * higher volumes (Pelland et al. 2024 dose–response meta-regression). 20 is a
 * practical ceiling, not a hard limit.
 */
export const HARD_SET_RANGE = { low: 10, high: 20 } as const;
/** Muscles judged against the range. Calves get heavy work from running; core from finishers. */
export const VERDICT_MUSCLES: Muscle[] = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes"];
/** A set further than this from failure isn't counted as hard. */
export const HARD_SET_MAX_RIR = 4;
/** Above this many reps-to-failure, rep-based 1RM estimates get unreliable. */
export const E1RM_MAX_REPS = 12;

export type StrengthSet = {
  weight_kg: number;
  reps: number | null;
  duration_s: number | null;
  rir: number | null;
  is_warmup: boolean;
};

export type StrengthSlot = {
  exercise_id: string;
  block: string; // "main" | "finisher"
  /** Template prescription at analysis time (null for added exercises). */
  target: { sets: number; rir: number | null } | null;
  sets: StrengthSet[];
};

export type StrengthSession = {
  id: string;
  date: string;
  minutes: number | null;
  session_rpe: number | null;
  activity_id: string | null;
  template_id: string | null;
  slots: StrengthSlot[];
};

export type ExerciseMeta = {
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  measure: string; // "reps" | "time"
  is_main_lift: boolean;
};

export type ExerciseIndex = Record<string, ExerciseMeta>;

// ---------------------------------------------------------------- per set

/**
 * Estimated 1RM, RIR-adjusted Epley: weight × (1 + (reps + RIR) / 30).
 * Adding RIR turns a set stopped short of failure into its "reps to failure".
 * Unrated RIR counts as 0, so the estimate is a lower bound.
 * Limits: only for reps + RIR ≤ 12 (null above); RIR is a self-estimate
 * (typically ±1 rep); machines and dumbbells aren't comparable to barbells.
 * Use it for trends within one exercise, not as a real max.
 */
export function e1rm(weightKg: number, reps: number | null, rir: number | null): number | null {
  if (!reps || reps < 1 || weightKg <= 0) return null;
  const toFailure = reps + (rir ?? 0);
  if (toFailure > E1RM_MAX_REPS) return null;
  if (toFailure <= 1) return weightKg;
  return weightKg * (1 + toFailure / 30);
}

export function isHardSet(s: StrengthSet, block: string, measure: string): boolean {
  if (s.is_warmup || block !== "main" || measure !== "reps") return false;
  if (!s.reps || s.reps < 1) return false;
  return s.rir === null || s.rir <= HARD_SET_MAX_RIR;
}

// ---------------------------------------------------------------- per session

export function bestE1rm(sets: StrengthSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.is_warmup) continue;
    const v = e1rm(s.weight_kg, s.reps, s.rir);
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best;
}

export function tonnage(sessions: StrengthSession[]): number {
  let t = 0;
  for (const w of sessions)
    for (const slot of w.slots)
      for (const s of slot.sets) if (!s.is_warmup && s.reps) t += s.weight_kg * s.reps;
  return t;
}

/** Hard sets per muscle (fractional: primary 1, secondary 0.5). */
export function muscleSets(sessions: StrengthSession[], index: ExerciseIndex): Record<Muscle, number> {
  const out = Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Record<Muscle, number>;
  for (const w of sessions) {
    for (const slot of w.slots) {
      const meta = index[slot.exercise_id];
      if (!meta) continue;
      const hard = slot.sets.filter((s) => isHardSet(s, slot.block, meta.measure)).length;
      if (hard === 0) continue;
      for (const m of meta.primary_muscles) if (m in out) out[m as Muscle] += hard;
      for (const m of meta.secondary_muscles) if (m in out) out[m as Muscle] += hard * 0.5;
    }
  }
  return out;
}

export type Adherence = {
  /** Prescribed working sets in the template's main block. */
  prescribed: number;
  /** Working sets done, capped at the prescription per exercise. */
  done: number;
  setShare: number | null;
  /** Share of rated working sets within ±1 of the target RIR (null: nothing to compare). */
  rirShare: number | null;
};

/** How closely a session followed its template (main block only). */
export function adherence(w: StrengthSession): Adherence {
  let prescribed = 0;
  let done = 0;
  let rated = 0;
  let onTarget = 0;
  for (const slot of w.slots) {
    if (slot.block !== "main" || !slot.target) continue;
    const working = slot.sets.filter((s) => !s.is_warmup);
    prescribed += slot.target.sets;
    done += Math.min(working.length, slot.target.sets);
    if (slot.target.rir === null) continue;
    for (const s of working) {
      if (s.rir === null) continue;
      rated += 1;
      if (Math.abs(s.rir - slot.target.rir) <= 1) onTarget += 1;
    }
  }
  return {
    prescribed,
    done,
    setShare: prescribed > 0 ? done / prescribed : null,
    rirShare: rated > 0 ? onTarget / rated : null,
  };
}

// ---------------------------------------------------------------- weekly

export type GymWeek = {
  week: string; // Monday
  sessions: number;
  workingSets: number;
  hardSets: number;
  tonnage: number;
  muscles: Record<Muscle, number>;
  /** Mean set adherence of sessions that had a template prescription. */
  setAdherence: number | null;
  rirAdherence: number | null;
};

export function weeklyGym(
  sessions: StrengthSession[],
  index: ExerciseIndex,
  today: string,
  weeks: number,
): GymWeek[] {
  return weekStarts(today, weeks).map((week) => {
    const inWeek = sessions.filter((w) => mondayOf(w.date) === week);
    const muscles = muscleSets(inWeek, index);
    let workingSets = 0;
    let hardSets = 0;
    for (const w of inWeek)
      for (const slot of w.slots) {
        const measure = index[slot.exercise_id]?.measure ?? "reps";
        for (const s of slot.sets) {
          if (!s.is_warmup) workingSets += 1;
          if (isHardSet(s, slot.block, measure)) hardSets += 1;
        }
      }
    const adh = inWeek.map(adherence);
    const setShares = adh.map((a) => a.setShare).filter((v): v is number => v !== null);
    const rirShares = adh.map((a) => a.rirShare).filter((v): v is number => v !== null);
    return {
      week,
      sessions: inWeek.length,
      workingSets,
      hardSets,
      tonnage: tonnage(inWeek),
      muscles,
      setAdherence: setShares.length ? mean(setShares) : null,
      rirAdherence: rirShares.length ? mean(rirShares) : null,
    };
  });
}

// ---------------------------------------------------------------- lifts

export type LiftPoint = { date: string; e1rm: number; topSet: StrengthSet };

/** Best e1RM per session for one exercise, oldest first. */
export function liftHistory(sessions: StrengthSession[], exerciseId: string): LiftPoint[] {
  const out: LiftPoint[] = [];
  for (const w of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    let best: LiftPoint | null = null;
    for (const slot of w.slots) {
      if (slot.exercise_id !== exerciseId) continue;
      for (const s of slot.sets) {
        if (s.is_warmup) continue;
        const v = e1rm(s.weight_kg, s.reps, s.rir);
        if (v !== null && (!best || v > best.e1rm)) best = { date: w.date, e1rm: v, topSet: s };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** Main lifts with data, most frequently trained first. */
export function trainedMainLifts(sessions: StrengthSession[], index: ExerciseIndex): string[] {
  const count: Record<string, number> = {};
  for (const w of sessions)
    for (const slot of w.slots)
      if (index[slot.exercise_id]?.is_main_lift && bestE1rm(slot.sets) !== null)
        count[slot.exercise_id] = (count[slot.exercise_id] ?? 0) + 1;
  return Object.keys(count).sort((a, b) => count[b] - count[a] || index[a].name.localeCompare(index[b].name));
}

/** Weekly best e1RM for one lift over the last `weeks` weeks (null = not trained that week). */
export function weeklyLift(
  sessions: StrengthSession[],
  exerciseId: string,
  today: string,
  weeks: number,
): { week: string; e1rm: number | null }[] {
  const hist = liftHistory(sessions, exerciseId);
  return weekStarts(today, weeks).map((week) => {
    const inWeek = hist.filter((p) => mondayOf(p.date) === week).map((p) => p.e1rm);
    return { week, e1rm: inWeek.length ? Math.max(...inWeek) : null };
  });
}

/** Trend of a weekly e1RM series as % of its level per week (null with < 3 points). */
export function liftTrendPctPerWeek(series: (number | null)[]): { pct: number; points: number } | null {
  const fit = linearFit(series);
  if (!fit) return null;
  const level = fit.fitted.at(-1)!;
  if (level <= 0) return null;
  return { pct: fit.slope / level, points: fit.points };
}

export type PrEvent = {
  date: string;
  exerciseId: string;
  kind: "e1rm" | "weight";
  value: number;
  previous: number;
  set: StrengthSet;
};

/**
 * Personal records, oldest first: a session's best e1RM (or heaviest working
 * weight) beating everything before it. The first session of an exercise sets
 * the baseline and is not a PR.
 */
export function personalRecords(sessions: StrengthSession[], index: ExerciseIndex): PrEvent[] {
  const bestE: Record<string, number> = {};
  const bestW: Record<string, number> = {};
  const out: PrEvent[] = [];
  for (const w of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    const bySlot: Record<string, StrengthSet[]> = {};
    for (const slot of w.slots) (bySlot[slot.exercise_id] ??= []).push(...slot.sets);
    for (const [id, sets] of Object.entries(bySlot)) {
      if (index[id]?.measure === "time") continue;
      const working = sets.filter((s) => !s.is_warmup && s.reps);
      if (working.length === 0) continue;
      let topE: { v: number; s: StrengthSet } | null = null;
      let topW: StrengthSet | null = null;
      for (const s of working) {
        const v = e1rm(s.weight_kg, s.reps, s.rir);
        if (v !== null && (!topE || v > topE.v)) topE = { v, s };
        if (!topW || s.weight_kg > topW.weight_kg) topW = s;
      }
      if (topE) {
        if (bestE[id] !== undefined && topE.v > bestE[id] + 1e-9)
          out.push({ date: w.date, exerciseId: id, kind: "e1rm", value: topE.v, previous: bestE[id], set: topE.s });
        bestE[id] = Math.max(bestE[id] ?? 0, topE.v);
      }
      if (topW && topW.weight_kg > 0) {
        if (bestW[id] !== undefined && topW.weight_kg > bestW[id] + 1e-9)
          out.push({ date: w.date, exerciseId: id, kind: "weight", value: topW.weight_kg, previous: bestW[id], set: topW });
        bestW[id] = Math.max(bestW[id] ?? 0, topW.weight_kg);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- load

/**
 * Completed workouts not linked to a Garmin activity, as load rows for
 * metrics.ts (duration from the logger, session RPE). Linked ones are
 * already counted through their Garmin activity: never count twice.
 */
export function unlinkedWorkoutActivities(sessions: StrengthSession[]): ActivityInput[] {
  return sessions
    .filter((w) => w.activity_id === null && w.minutes !== null && w.minutes > 0)
    .map((w) => ({
      date: w.date,
      type: "gym",
      distance_km: null,
      duration_min: w.minutes,
      avg_hr: null,
      max_hr: null,
      rpe: w.session_rpe,
    }));
}

// ---------------------------------------------------------------- helpers

/** Sessions within [from, to] inclusive. */
export function between(sessions: StrengthSession[], from: string, to: string) {
  return sessions.filter((w) => w.date >= from && w.date <= to);
}

export function thisWeek(sessions: StrengthSession[], today: string) {
  const monday = mondayOf(today);
  return between(sessions, monday, addDays(monday, 6));
}

function mean(v: number[]) {
  return v.reduce((s, x) => s + x, 0) / v.length;
}

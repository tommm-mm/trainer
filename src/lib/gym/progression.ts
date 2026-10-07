// Double progression: what each exercise should do next time, from the last
// session of it. Pure. The app suggests the structure (sets × reps @ RIR) and
// a weight *direction*; you pick the kilos. A suggestion only applies when you
// accept it in the logger (automate the plumbing, never the judgment).
//
// Judged on the working sets at the weight you did most sets at (a top set
// plus back-offs is judged on the back-offs; a tie goes to the weight you
// finished on, e.g. after dropping it mid-session).
// No advice for finishers (circuits), timed exercises, or fixed reps without
// a target RIR (box jumps 3×5): there's no weight to progress.
//
// Rules, per exercise with a rep range:
//   lower — half or more of those sets under the bottom of the range, not
//           easier than the target RIR
//   add   — every target set done at the top of the range, none rated more
//           than 1 RIR harder than target; or rated ≥ 2 RIR easier than
//           target with every set in range
//   same  — otherwise: same weight, add a rep per set toward the top; if the
//           sets were ≥ 2 RIR harder than target, stop at the target RIR; if
//           under the range but easier than target, push to the target RIR

import type { HistorySet, LastTime, LocalExercise, Measure, Target } from "./workout";
import type { Adjustment } from "./periodization";

export type WeightDirection = "add" | "same" | "keep" | "lower";

export type Advice = {
  weight: WeightDirection;
  sets: number;
  repMin: number;
  repMax: number;
  rir: number | null;
  /** Reps to aim for on the first working set. */
  aimReps: number;
  /** The weight last time's sets were judged at (prefill start point; you pick the kilos). */
  basisKg: number | null;
  /** RIR for the last set only (block week before a deload). */
  lastSetRir?: number | null;
  /** What the season block changes this week, e.g. "Lighter week: half the sets…". */
  blockNote?: string | null;
  /** One line, e.g. "10·10·10·10 @ RIR 2: top of the range". Empty when only the block speaks. */
  reason: string;
  /** Date of the session the advice is based on (null: block change only, no history). */
  basedOn: string | null;
  /** No RIR was logged: judged on reps only. */
  repsOnly: boolean;
};

/** How far (in RIR) a set may be off the target before it counts as too hard / too easy. */
export const RIR_MARGIN = 2;

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const kg = (w: number) => (w > 0 ? `${Math.round(w * 100) / 100} kg × ` : "BW × ");

/** The sets at the weight you did most sets at; a tie goes to the weight used last. */
export function mainWeightSets(sets: HistorySet[]): HistorySet[] {
  const count = new Map<number, number>();
  for (const s of sets) count.set(s.weight_kg, (count.get(s.weight_kg) ?? 0) + 1);
  const most = Math.max(...count.values());
  const best = [...sets].reverse().find((s) => count.get(s.weight_kg) === most)!.weight_kg;
  return sets.filter((s) => s.weight_kg === best);
}

function describe(sets: HistorySet[]): string {
  const reps = sets.map((s) => s.reps).join("·");
  const rirs = [...new Set(sets.map((s) => s.rir).filter((r): r is number => r != null))];
  const rir = rirs.length === 0 ? "" : rirs.length === 1 ? ` @ RIR ${rirs[0]}` : ` @ RIR ${Math.min(...rirs)}–${Math.max(...rirs)}`;
  return `${kg(sets[0].weight_kg)}${reps}${rir}`;
}

export function adviseNext(
  target: Target | null,
  last: LastTime | undefined,
  measure: Measure,
  block: "main" | "finisher" = "main",
): Advice | null {
  if (measure !== "reps" || block === "finisher" || !target || !last) return null;
  const { repMin, repMax } = target;
  if (repMin == null || repMax == null) return null;
  if (repMin === repMax && target.rir == null) return null;
  const all = last.sets.filter((s) => !s.is_warmup && s.reps != null && s.reps > 0);
  if (all.length === 0) return null;
  const working = mainWeightSets(all);

  const reps = working.map((s) => s.reps!);
  const rated = working.filter((s) => s.rir != null).map((s) => s.rir!);
  const targetRir = target.rir;
  const rirGap = targetRir != null && rated.length ? avg(rated) - targetRir : null; // + = easier than target
  const repsOnly = rated.length === 0 || targetRir == null;
  const seen = describe(working);
  const base = { sets: target.sets, repMin, repMax, rir: targetRir, basedOn: last.date, repsOnly, basisKg: working[0].weight_kg };

  const under = reps.filter((r) => r < repMin).length;
  const aimUp = Math.max(repMin, Math.min(repMax, Math.min(...reps) + 1));
  if (under * 2 >= reps.length && rirGap !== null && rirGap > 0) {
    return {
      ...base,
      weight: "same",
      aimReps: aimUp,
      reason: `${seen}: under ${repMin} reps but easier than RIR ${targetRir}, push to RIR ${targetRir}`,
    };
  }
  if (under * 2 >= reps.length) {
    return {
      ...base,
      weight: "lower",
      aimReps: repMin,
      reason: `${seen}: under ${repMin} reps on ${under} of ${reps.length} sets`,
    };
  }
  if (rirGap !== null && rirGap <= -RIR_MARGIN) {
    const aimHard = Math.min(repMax, Math.min(...reps));
    return {
      ...base,
      weight: "same",
      aimReps: aimHard,
      reason: `${seen}: harder than RIR ${targetRir}, keep the weight and stop at RIR ${targetRir}`,
    };
  }

  const allTop = reps.length >= target.sets && reps.every((r) => r >= repMax);
  const notGrinding = targetRir == null || rated.every((r) => r >= targetRir - 1);
  if (allTop && notGrinding) {
    return { ...base, weight: "add", aimReps: repMin, reason: `${seen}: top of the range on every set` };
  }
  if (rirGap !== null && rirGap >= RIR_MARGIN && under === 0) {
    return { ...base, weight: "add", aimReps: repMin, reason: `${seen}: easier than RIR ${targetRir}` };
  }

  return {
    ...base,
    weight: "same",
    aimReps: aimUp,
    reason: `${seen}: in the range, aim for ${aimUp}+ reps per set`,
  };
}

export const WEIGHT_LABELS: Record<WeightDirection, string> = {
  add: "add weight",
  same: "same weight, +1 rep per set",
  keep: "same weight",
  lower: "lower the weight",
};

/**
 * Progression advice with this week's block change on top: the block sets the
 * sets / RIR (and, in a deload, holds the weight); progression keeps the reps
 * and the weight direction. A block change alone (no history yet) still
 * makes a suggestion.
 */
export function withBlock(
  advice: Advice | null,
  adjust: Adjustment | undefined,
  target: Target | null,
): Advice | null {
  if (!adjust) return advice;
  if (advice) {
    // A deload holds the weight (no extra reps), but never overrides "lower".
    const hold = adjust.weight === "keep" && advice.weight !== "lower";
    return {
      ...advice,
      sets: adjust.sets,
      rir: adjust.rir,
      lastSetRir: adjust.lastSetRir,
      weight: hold ? "keep" : advice.weight,
      aimReps: hold ? advice.repMin : advice.aimReps,
      blockNote: adjust.note,
    };
  }
  if (!target || target.repMin == null || target.repMax == null) return null;
  return {
    weight: "keep",
    sets: adjust.sets,
    repMin: target.repMin,
    repMax: target.repMax,
    rir: adjust.rir,
    aimReps: target.repMin,
    reason: "",
    basedOn: null,
    repsOnly: false,
    basisKg: null,
    lastSetRir: adjust.lastSetRir,
    blockNote: adjust.note,
  };
}

/**
 * The suggestion still waiting for your answer on an exercise: none once you
 * decided, or once you started logging working sets (it's then moot).
 */
export function pendingAdvice(
  ex: Pick<LocalExercise, "target" | "sets" | "advice" | "block">,
  last: LastTime | undefined,
  measure: Measure,
  adjust?: Adjustment,
): Advice | null {
  if (ex.advice || ex.sets.some((s) => !s.isWarmup)) return null;
  if (measure !== "reps") return null;
  return withBlock(adviseNext(ex.target, last, measure, ex.block), adjust, ex.target);
}

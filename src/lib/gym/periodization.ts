// Gym periodization: what the season block asks of this week's sessions, on
// top of session-to-session progression. Pure. Like every suggestion it only
// applies when you accept it in the logger.
//
// The step comes from the approved season, counting back from the next
// lighter week (so it follows the 3:1 / 4:1 rhythm wherever deloads land):
//   deload        a lighter week (deload, taper, recovery, transition):
//                 half the sets, same weights, RIR 3–4 (any gym focus)
//   plus_set      2 weeks before it, hypertrophy blocks: +1 set on the
//                 session's two upper-body compounds
//   last_set_rir0 the week before it, hypertrophy blocks: last set of the
//                 upper-body accessories to RIR 0
//   base          otherwise: the template as written
// Base 1 2026: 5 Oct base · 12 Oct +1 set · 19 Oct RIR 0 · 26 Oct deload.

export type CycleStep = "base" | "plus_set" | "last_set_rir0" | "deload";

export type BlockContext = {
  /** Monday of the week it applies to. */
  monday: string;
  block: string;
  gymFocus: string | null;
  step: CycleStep;
};

export type SeasonBlockInput = {
  name: string;
  focus: string;
  gym_focus?: string | null;
  weeks: { week_start: string; is_deload?: boolean | null }[];
};

const LIGHT_FOCUS = ["taper", "recovery", "transition"];

/** The block and cycle step for the week of `monday`, or null outside the season. */
export function blockContext(blocks: SeasonBlockInput[], monday: string): BlockContext | null {
  const weeks = blocks.flatMap((b) =>
    b.weeks.map((w) => ({ ...w, block: b, light: !!w.is_deload || LIGHT_FOCUS.includes(b.focus) })),
  );
  const i = weeks.findIndex((w) => w.week_start === monday);
  if (i < 0) return null;
  const w = weeks[i];
  const base = { monday, block: w.block.name, gymFocus: w.block.gym_focus ?? null };
  if (w.light) return { ...base, step: "deload" };
  if (w.block.gym_focus !== "hypertrophy") return { ...base, step: "base" };
  const next = weeks.findIndex((x, j) => j > i && x.light);
  const toLight = next < 0 ? null : next - i;
  if (toLight === 1) return { ...base, step: "last_set_rir0" };
  if (toLight === 2) return { ...base, step: "plus_set" };
  return { ...base, step: "base" };
}

export type PlanExercise = {
  id: string;
  block: "main" | "finisher";
  sets: number;
  rir: number | null;
  mechanic: string | null;
  primaryMuscles: string[];
};

export type Adjustment = {
  sets: number;
  rir: number | null;
  /** RIR for the last set only (accessories in the week before a deload). */
  lastSetRir: number | null;
  /** Holds the weight (deload: same weights, no extra reps). */
  weight: "keep" | null;
  note: string;
};

const UPPER = ["chest", "back", "shoulders", "biceps", "triceps"];
const isUpper = (e: PlanExercise) => e.primaryMuscles.some((m) => UPPER.includes(m));

export const DELOAD_RIR = 3;

/** Per-exercise changes for this session (in template order), keyed by exercise id. */
export function blockAdjustments(exercises: PlanExercise[], step: CycleStep): Map<string, Adjustment> {
  const out = new Map<string, Adjustment>();
  const main = exercises.filter((e) => e.block === "main");
  const keep = (e: PlanExercise) => ({ sets: e.sets, rir: e.rir, lastSetRir: null, weight: null });

  if (step === "deload") {
    for (const e of main) {
      out.set(e.id, {
        sets: Math.max(1, Math.ceil(e.sets / 2)),
        rir: Math.max(e.rir ?? DELOAD_RIR, DELOAD_RIR),
        lastSetRir: null,
        weight: "keep",
        note: "Lighter week: half the sets, same weights, RIR 3–4",
      });
    }
  } else if (step === "plus_set") {
    for (const e of main.filter((x) => x.mechanic === "compound" && isUpper(x)).slice(0, 2)) {
      out.set(e.id, { ...keep(e), sets: e.sets + 1, note: "Block week: +1 set on the two upper-body compounds" });
    }
  } else if (step === "last_set_rir0") {
    for (const e of main.filter((x) => x.mechanic !== "compound" && isUpper(x))) {
      out.set(e.id, { ...keep(e), lastSetRir: 0, note: "Block week: last set to RIR 0 before the deload" });
    }
  }
  return out;
}

export const STEP_LABELS: Record<CycleStep, string> = {
  base: "template sets",
  plus_set: "+1 set on upper compounds",
  last_set_rir0: "last accessory set to RIR 0",
  deload: "deload",
};

// Gym periodization: what the season asks of this week's sessions, on top of
// session-to-session progression. Pure. Like every suggestion it only applies
// when you accept it in the logger, and you can edit sets / reps / RIR there.
//
// The app decides one thing by itself, from the approved season:
//   deload   a lighter week (deload, taper, recovery, transition):
//            half the sets, same weights, RIR 3–4 (any gym focus)
//   base     otherwise: the template as written
// Everything else (+1 set, last set to RIR 0, any sets / reps / RIR change on any
// week) is the PT's call, through week rules (gym_week_rules, src/lib/gym/rules.ts),
// which replace these defaults for their week.

import { applyRules, type Adjustment, type GymRule, type PlanExercise } from "./rules";

export type CycleStep = "base" | "deload";

export type BlockContext = {
  /** Monday of the week it applies to. */
  monday: string;
  /** Season block name (null: a coach-ruled week outside the season). */
  block: string | null;
  gymFocus: string | null;
  step: CycleStep;
  /** The coach's rules for this week (gym_week_rules): they replace the default ones. */
  coach?: { rules: GymRule[]; note: string | null };
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
  return { ...base, step: w.light ? "deload" : "base" };
}

export type { Adjustment, PlanExercise } from "./rules";

export const DELOAD_RIR = 3;

/** The app's default block rules, used in weeks without coach rules. */
export const DEFAULT_RULES: Record<CycleStep, GymRule[]> = {
  base: [],
  deload: [
    { sets_factor: 0.5, min_rir: DELOAD_RIR, weight: "keep", note: "Lighter week: half the sets, same weights, RIR 3–4" },
  ],
};

/** Per-exercise changes for this session (default block rules), keyed by exercise id. */
export function blockAdjustments(exercises: PlanExercise[], step: CycleStep): Map<string, Adjustment> {
  return applyRules(exercises, DEFAULT_RULES[step]);
}

/** The coach's week rules on top of the season context (they win over the defaults). */
export function withCoachRules(
  ctx: BlockContext | null,
  monday: string,
  row: { rules: GymRule[]; note: string | null } | null,
): BlockContext | null {
  if (!row) return ctx;
  return { ...(ctx ?? { monday, block: null, gymFocus: null, step: "base" as const }), coach: row };
}

/** The rules that apply this week: the coach's, else the default block rules. */
export const weekRules = (ctx: BlockContext): GymRule[] => ctx.coach?.rules ?? DEFAULT_RULES[ctx.step];

export const STEP_LABELS: Record<CycleStep, string> = {
  base: "template sets",
  deload: "deload",
};

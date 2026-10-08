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
// A week with coach rules (gym_week_rules) uses those instead (src/lib/gym/rules.ts).

import { applyRules, type Adjustment, type GymRule, type PlanExercise } from "./rules";

export type CycleStep = "base" | "plus_set" | "last_set_rir0" | "deload";

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
  if (w.light) return { ...base, step: "deload" };
  if (w.block.gym_focus !== "hypertrophy") return { ...base, step: "base" };
  const next = weeks.findIndex((x, j) => j > i && x.light);
  const toLight = next < 0 ? null : next - i;
  if (toLight === 1) return { ...base, step: "last_set_rir0" };
  if (toLight === 2) return { ...base, step: "plus_set" };
  return { ...base, step: "base" };
}

export type { Adjustment, PlanExercise } from "./rules";

export const DELOAD_RIR = 3;

/** The app's default block rules, used in weeks without coach rules. */
export const DEFAULT_RULES: Record<CycleStep, GymRule[]> = {
  base: [],
  deload: [
    { sets_factor: 0.5, min_rir: DELOAD_RIR, weight: "keep", note: "Lighter week: half the sets, same weights, RIR 3–4" },
  ],
  plus_set: [
    {
      match: { mechanic: "compound", region: "upper", limit: 2 },
      sets_delta: 1,
      note: "Block week: +1 set on the two upper-body compounds",
    },
  ],
  last_set_rir0: [
    { match: { mechanic: "isolation", region: "upper" }, last_set_rir: 0, note: "Block week: last set to RIR 0 before the deload" },
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
  plus_set: "+1 set on upper compounds",
  last_set_rir0: "last accessory set to RIR 0",
  deload: "deload",
};

// Which templates belong to the current block. Pure. A template lists the
// block gym focuses it's for (workout_templates.gym_focus); none = every block.
// The Gym tab, the Today card rotation and the week checks use the current
// block's templates, and fall back to all of them when none match (so a
// missing tag never leaves you without a workout).

export const GYM_FOCUSES = ["hypertrophy", "strength", "power", "maintenance", "off"] as const;

export function forFocus<T extends { gym_focus?: string[] | null }>(templates: T[], focus: string | null): T[] {
  if (!focus) return templates;
  const hit = templates.filter((t) => !t.gym_focus?.length || t.gym_focus.includes(focus));
  return hit.length ? hit : templates;
}

/** "strength, maintenance" or "every block". */
export const focusLabel = (f: string[] | null | undefined) => (f?.length ? f.join(", ") : "every block");

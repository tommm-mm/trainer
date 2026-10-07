// The app's own questions about your gym templates (C2d). Pure. A question is
// never applied by itself: it shows as a card ("Add face pulls to B?") and
// only a Yes turns it into an approved coach proposal.
//
//   volume gap  hypertrophy blocks: an upper-body muscle gets fewer than 10
//               hard sets a week from the templates (Base secondary goal:
//               10–20). Proposes an isolation exercise for it from the
//               library, added to the template with the fewest hard sets.
//   stall       a main lift whose best e1RM hasn't risen over its last 4
//               sessions (≥ 3 weeks): proposes a swap for a similar exercise
//               (same main muscle and mechanic, ideally other equipment).

import { daysBetween } from "@/lib/dates";
import { bestE1rm, type StrengthSession } from "@/lib/strength";

export type QuestionExercise = {
  id: string;
  name: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  mechanic: string | null;
  equipment: string | null;
  measure: string;
};

export type QuestionTemplate = {
  id: string;
  name: string;
  items: { id: string; exercise_id: string; block: string; sets: number; target_rir: number | null }[];
};

export type Question = {
  /** Same key = same question; a decided one isn't asked again for a while. */
  key: string;
  kind: "template_exercise_add" | "template_exercise_swap";
  payload: Record<string, unknown>;
  title: string;
  rationale: string;
};

export const VOLUME_MIN_SETS = 10;
export const UPPER_MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps"];
const HARD_RIR = 4;

/** Hard sets a week each muscle gets if every template is done once (primary ×1, secondary ×0.5). */
export function plannedSets(templates: QuestionTemplate[], byId: Map<string, QuestionExercise>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (m: string, n: number) => out.set(m, (out.get(m) ?? 0) + n);
  for (const t of templates) {
    for (const i of t.items) {
      const e = byId.get(i.exercise_id);
      if (!e || i.block !== "main" || e.measure !== "reps" || i.target_rir == null || i.target_rir > HARD_RIR) continue;
      for (const m of e.primary_muscles) add(m, i.sets);
      for (const m of e.secondary_muscles) add(m, i.sets * 0.5);
    }
  }
  return out;
}

const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1);

export function volumeQuestions(opts: {
  templates: QuestionTemplate[];
  library: QuestionExercise[];
  gymFocus: string | null;
}): Question[] {
  if (opts.gymFocus !== "hypertrophy" || opts.templates.length === 0) return [];
  const byId = new Map(opts.library.map((e) => [e.id, e]));
  const planned = plannedSets(opts.templates, byId);
  const used = new Set(opts.templates.flatMap((t) => t.items.map((i) => i.exercise_id)));
  const hardSets = (t: QuestionTemplate) =>
    t.items.filter((i) => i.block === "main" && i.target_rir != null && i.target_rir <= HARD_RIR).reduce((n, i) => n + i.sets, 0);
  const lightest = [...opts.templates].sort((a, b) => hardSets(a) - hardSets(b))[0];
  const out: Question[] = [];
  for (const m of UPPER_MUSCLES) {
    const n = planned.get(m) ?? 0;
    if (n >= VOLUME_MIN_SETS) continue;
    const pick = opts.library
      .filter((e) => e.measure === "reps" && e.primary_muscles.includes(m) && !used.has(e.id))
      .sort((a, b) => Number(b.mechanic === "isolation") - Number(a.mechanic === "isolation") || a.name.localeCompare(b.name))[0];
    if (!pick) continue;
    out.push({
      key: `volume:${m}`,
      kind: "template_exercise_add",
      payload: { template_id: lightest.id, exercise_id: pick.id, block: "main", sets: 3, rep_min: 10, rep_max: 15, target_rir: 1, rest_seconds: 90 },
      title: `Add ${pick.name} 3×10–15 to ${lightest.name}?`,
      rationale: `${label(m)}: ${Math.round(n * 10) / 10} hard sets planned a week, Base target ≥ ${VOLUME_MIN_SETS}.`,
    });
  }
  return out;
}

export const STALL_SESSIONS = 4;
export const STALL_MIN_DAYS = 21;

export function stallQuestions(opts: {
  templates: QuestionTemplate[];
  library: QuestionExercise[];
  /** Completed workouts, any order. */
  sessions: StrengthSession[];
}): Question[] {
  const byId = new Map(opts.library.map((e) => [e.id, e]));
  const used = new Set(opts.templates.flatMap((t) => t.items.map((i) => i.exercise_id)));
  const sorted = [...opts.sessions].sort((a, b) => a.date.localeCompare(b.date));
  const out: Question[] = [];
  for (const t of opts.templates) {
    for (const i of t.items) {
      const e = byId.get(i.exercise_id);
      if (!e || i.block !== "main" || e.measure !== "reps") continue;
      const series = sorted
        .map((s) => ({ date: s.date, best: bestE1rm(s.slots.filter((x) => x.exercise_id === i.exercise_id).flatMap((x) => x.sets)) }))
        .filter((x): x is { date: string; best: number } => x.best !== null)
        .slice(-STALL_SESSIONS);
      if (series.length < STALL_SESSIONS || daysBetween(series[0].date, series.at(-1)!.date) < STALL_MIN_DAYS) continue;
      const first = series[0].best;
      if (Math.max(...series.slice(1).map((x) => x.best)) > first) continue;
      const main = e.primary_muscles[0];
      const alt = opts.library
        .filter((x) => x.id !== e.id && !used.has(x.id) && x.measure === "reps" && x.primary_muscles[0] === main && x.mechanic === e.mechanic)
        .sort((a, b) => Number(a.equipment === e.equipment) - Number(b.equipment === e.equipment) || a.name.localeCompare(b.name))[0];
      if (!alt) continue;
      const kg = series.map((x) => Math.round(x.best)).join(" → ");
      out.push({
        key: `stall:${i.id}`,
        kind: "template_exercise_swap",
        payload: { template_exercise_id: i.id, exercise_id: alt.id },
        title: `Swap ${e.name} for ${alt.name} in ${t.name}?`,
        rationale: `${e.name} has stalled: best e1RM ${kg} kg over ${series.length} sessions. A new variation restarts progress.`,
      });
    }
  }
  return out;
}

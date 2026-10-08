// Gym week rules: how a week changes the templates (sets, RIR, rep range,
// weight direction) for a group of exercises. Pure. The coach writes them per
// week (gym_week_rules, via a `gym_rules_set` proposal you approve); weeks
// without coach rules use the app's default block rules (DEFAULT_RULES). Like
// every suggestion, they only apply when you accept them in the logger, and
// the app never picks the kilos.
//
// A rule = which exercises (`match`) + what changes. Rules run in order, each
// on the result of the previous ones, so a later rule can refine an earlier
// one. Exercises no rule matches keep the template.
//
//   match      block        "main" (default) | "finisher" | "any"
//              mechanic     "compound" | "isolation"
//              region       "upper" (chest, back, shoulders, biceps, triceps)
//                           | "lower" (quads, hamstrings, glutes, calves)
//              muscles      any of these primary muscles
//              exercise_ids / template_ids
//              limit        only the first N matches of the session (template order)
//   changes    sets | sets_delta | sets_factor (×, rounded up; min 1 set)
//              rir | rir_delta, then min_rir / max_rir (floors and caps)
//              last_set_rir (the last set only)
//              rep_min, rep_max (this week's range)
//              weight       "keep" (hold the weights; never overrides a "lower"
//                           from progression) | "add" | "lower"
//              note         shown in the logger and saved with what you accept
//
// Example (a strength block week): main lifts 3×4–6 @ RIR 3, legs never below RIR 2
//   [{ "match": { "mechanic": "compound" }, "rep_min": 4, "rep_max": 6, "rir": 3 },
//    { "match": { "region": "lower" }, "min_rir": 2, "note": "legs ≥ RIR 2" }]

export type RuleMatch = {
  block?: "main" | "finisher" | "any";
  mechanic?: "compound" | "isolation";
  region?: "upper" | "lower";
  muscles?: string[];
  exercise_ids?: string[];
  template_ids?: string[];
  limit?: number;
};

export type GymRule = {
  match?: RuleMatch;
  sets?: number;
  sets_delta?: number;
  sets_factor?: number;
  rir?: number;
  rir_delta?: number;
  min_rir?: number;
  max_rir?: number;
  last_set_rir?: number;
  rep_min?: number;
  rep_max?: number;
  weight?: "keep" | "add" | "lower";
  note?: string;
};

/** One exercise of the session as the template prescribes it. */
export type PlanExercise = {
  /** Id of the exercise in this workout (adjustments are keyed by it). */
  id: string;
  /** Library exercise id (for `exercise_ids`). */
  exerciseId?: string;
  block: "main" | "finisher";
  sets: number;
  rir: number | null;
  repMin?: number | null;
  repMax?: number | null;
  mechanic: string | null;
  primaryMuscles: string[];
};

export type Adjustment = {
  sets: number;
  rir: number | null;
  /** RIR for the last set only. */
  lastSetRir: number | null;
  /** This week's rep range (null: the template's). */
  repMin?: number | null;
  repMax?: number | null;
  /** Weight direction for the week (null: progression decides). */
  weight: "keep" | "add" | "lower" | null;
  note: string;
};

export const UPPER = ["chest", "back", "shoulders", "biceps", "triceps"];
export const LOWER = ["quads", "hamstrings", "glutes", "calves"];
const MUSCLES = [...UPPER, ...LOWER, "core"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const int = (v: unknown, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/**
 * Checks coach rules. Returns the usable rules and a list of problems (shown on
 * the proposal card). Unknown keys are reported, never silently applied.
 */
export function parseRules(raw: unknown): { rules: GymRule[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { rules: [], errors: ["rules must be a list"] };
  const rules: GymRule[] = [];
  raw.forEach((r, i) => {
    const at = `rule ${i + 1}`;
    if (!isObj(r)) return errors.push(`${at}: not an object`);
    const bad: string[] = [];
    const known = ["match", "sets", "sets_delta", "sets_factor", "rir", "rir_delta", "min_rir", "max_rir", "last_set_rir", "rep_min", "rep_max", "weight", "note"];
    for (const k of Object.keys(r)) if (!known.includes(k)) bad.push(`unknown "${k}"`);
    const checks: [string, (v: unknown) => boolean][] = [
      ["sets", (v) => int(v, 1, 10)],
      ["sets_delta", (v) => int(v, -5, 5)],
      ["sets_factor", (v) => typeof v === "number" && v > 0 && v <= 3],
      ["rir", (v) => int(v, 0, 6)],
      ["rir_delta", (v) => int(v, -5, 5)],
      ["min_rir", (v) => int(v, 0, 6)],
      ["max_rir", (v) => int(v, 0, 6)],
      ["last_set_rir", (v) => int(v, 0, 6)],
      ["rep_min", (v) => int(v, 1, 50)],
      ["rep_max", (v) => int(v, 1, 50)],
      ["weight", (v) => v === "keep" || v === "add" || v === "lower"],
      ["note", (v) => typeof v === "string" && v.length <= 140],
    ];
    for (const [k, ok] of checks) if (k in r && !ok(r[k])) bad.push(`bad "${k}"`);
    if (int(r.rep_min, 1, 50) && int(r.rep_max, 1, 50) && (r.rep_min as number) > (r.rep_max as number)) bad.push("rep_min > rep_max");
    if ("match" in r) {
      const m = r.match;
      if (!isObj(m)) bad.push("match must be an object");
      else {
        for (const k of Object.keys(m))
          if (!["block", "mechanic", "region", "muscles", "exercise_ids", "template_ids", "limit"].includes(k)) bad.push(`unknown match "${k}"`);
        if ("block" in m && !["main", "finisher", "any"].includes(m.block as string)) bad.push('bad match "block"');
        if ("mechanic" in m && !["compound", "isolation"].includes(m.mechanic as string)) bad.push('bad match "mechanic"');
        if ("region" in m && !["upper", "lower"].includes(m.region as string)) bad.push('bad match "region"');
        if ("muscles" in m && !(Array.isArray(m.muscles) && m.muscles.every((x) => MUSCLES.includes(x as string)))) bad.push('bad match "muscles"');
        for (const k of ["exercise_ids", "template_ids"])
          if (k in m && !(Array.isArray(m[k]) && (m[k] as unknown[]).every((x) => typeof x === "string"))) bad.push(`bad match "${k}"`);
        if ("limit" in m && !int(m.limit, 1, 20)) bad.push('bad match "limit"');
      }
    }
    if (bad.length) errors.push(`${at}: ${bad.join(", ")}`);
    else rules.push(r as GymRule);
  });
  return { rules: errors.length ? [] : rules, errors };
}

function matches(e: PlanExercise, m: RuleMatch, templateId: string | null): boolean {
  const block = m.block ?? "main";
  if (block !== "any" && e.block !== block) return false;
  if (m.mechanic && e.mechanic !== m.mechanic) return false;
  if (m.region === "upper" && !e.primaryMuscles.some((x) => UPPER.includes(x))) return false;
  if (m.region === "lower" && !e.primaryMuscles.some((x) => LOWER.includes(x))) return false;
  if (m.muscles && !e.primaryMuscles.some((x) => m.muscles!.includes(x))) return false;
  if (m.exercise_ids && !(e.exerciseId && m.exercise_ids.includes(e.exerciseId))) return false;
  if (m.template_ids && !(templateId && m.template_ids.includes(templateId))) return false;
  return true;
}

/** Per-exercise changes for this session, keyed by the workout exercise id. */
export function applyRules(
  exercises: PlanExercise[],
  rules: GymRule[],
  templateId: string | null = null,
): Map<string, Adjustment> {
  const out = new Map<string, Adjustment & { notes: string[] }>();
  for (const rule of rules) {
    const m = rule.match ?? {};
    let hits = exercises.filter((e) => matches(e, m, templateId));
    if (m.limit) hits = hits.slice(0, m.limit);
    for (const e of hits) {
      const cur =
        out.get(e.id) ??
        { sets: e.sets, rir: e.rir, lastSetRir: null, repMin: null, repMax: null, weight: null, note: "", notes: [] };
      let sets = rule.sets ?? (rule.sets_factor != null ? Math.ceil(cur.sets * rule.sets_factor) : cur.sets);
      sets = Math.max(1, sets + (rule.sets_delta ?? 0));
      let rir = rule.rir ?? (cur.rir != null && rule.rir_delta != null ? cur.rir + rule.rir_delta : cur.rir);
      if (rule.min_rir != null) rir = Math.max(rir ?? rule.min_rir, rule.min_rir);
      if (rule.max_rir != null && rir != null) rir = Math.min(rir, rule.max_rir);
      if (rir != null) rir = Math.max(0, rir);
      const next = {
        ...cur,
        sets,
        rir,
        lastSetRir: rule.last_set_rir ?? cur.lastSetRir,
        repMin: rule.rep_min ?? cur.repMin,
        repMax: rule.rep_max ?? cur.repMax,
        weight: rule.weight ?? cur.weight,
        notes: [...cur.notes, rule.note ?? describeChange(rule)].filter((n, i, a) => n && a.indexOf(n) === i),
      };
      out.set(e.id, next);
    }
  }
  return new Map(
    [...out].map(([id, { notes, ...a }]) => [id, { ...a, note: notes.join(" · ") }]),
  );
}

/** What a rule changes, in words ("+1 set, RIR 3"). */
export function describeChange(r: GymRule): string {
  const parts: string[] = [];
  if (r.sets != null) parts.push(`${r.sets} sets`);
  if (r.sets_factor != null) parts.push(r.sets_factor === 0.5 ? "half the sets" : `sets ×${r.sets_factor}`);
  if (r.sets_delta) parts.push(`${r.sets_delta > 0 ? "+" : ""}${r.sets_delta} set${Math.abs(r.sets_delta) > 1 ? "s" : ""}`);
  if (r.rep_min != null || r.rep_max != null)
    parts.push(`${r.rep_min ?? "?"}${r.rep_max != null && r.rep_max !== r.rep_min ? `–${r.rep_max}` : ""} reps`);
  if (r.rir != null) parts.push(`RIR ${r.rir}`);
  if (r.rir_delta) parts.push(`RIR ${r.rir_delta > 0 ? "+" : ""}${r.rir_delta}`);
  if (r.min_rir != null) parts.push(`RIR ≥ ${r.min_rir}`);
  if (r.max_rir != null) parts.push(`RIR ≤ ${r.max_rir}`);
  if (r.last_set_rir != null) parts.push(`last set RIR ${r.last_set_rir}`);
  if (r.weight) parts.push({ keep: "same weights", add: "add weight", lower: "lower the weight" }[r.weight]);
  return parts.join(", ");
}

/** Which exercises a rule targets, in words ("upper-body compounds (first 2)"). */
export function describeMatch(m: RuleMatch = {}, names?: { exercises?: Map<string, string>; templates?: Map<string, string> }): string {
  const what: string[] = [];
  if (m.region) what.push(m.region === "upper" ? "upper-body" : "leg");
  if (m.muscles) what.push(m.muscles.join("/"));
  what.push(m.mechanic === "compound" ? "compounds" : m.mechanic === "isolation" ? "accessories" : "exercises");
  let s = what.join(" ");
  if (m.exercise_ids) s = m.exercise_ids.map((id) => names?.exercises?.get(id) ?? "unknown exercise").join(", ");
  if (m.block === "finisher") s += " (finisher)";
  if (m.block === "any") s += " (incl. finisher)";
  if (m.template_ids) s += ` in ${m.template_ids.map((id) => names?.templates?.get(id) ?? "unknown template").join(", ")}`;
  if (m.limit) s += ` (first ${m.limit})`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function describeRules(rules: GymRule[], names?: Parameters<typeof describeMatch>[1]): string {
  if (rules.length === 0) return "templates as written";
  return rules
    .map((r) => `${describeMatch(r.match, names)}: ${[describeChange(r), r.note].filter(Boolean).join(" · ")}`)
    .join("; ");
}

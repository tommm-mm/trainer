// Coach proposals: what a coach wants to change, as you see it before
// approving. Pure. Applying happens in the DB (apply_coach_proposal), in one
// transaction, only on your tap.

import { formatDay } from "@/lib/dates";
import { sessionLabel } from "@/lib/sessions";

export const PROPOSAL_KINDS = [
  "session_update",
  "session_cancel",
  "template_exercise_add",
  "template_exercise_update",
  "template_exercise_swap",
  "template_exercise_remove",
  "template_create",
  "template_archive",
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const SOURCE_LABELS: Record<string, string> = {
  cowork: "Cowork",
  engine: "the app's rules",
  claude_code: "Claude Code",
  claude_api: "AI coach",
  manual: "you",
};

export type ProposalContext = {
  plans: Map<string, { day: string; session_type: string; target_distance_km: number | null; template_id: string | null }>;
  templates: Map<string, string>;
  templateExercises: Map<
    string,
    { template: string; exercise: string; sets: number; rep_min: number | null; rep_max: number | null; target_rir: number | null }
  >;
  exercises: Map<string, string>;
};

type Payload = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : v == null ? null : Number(v));

function prescription(p: { sets?: unknown; rep_min?: unknown; rep_max?: unknown; target_rir?: unknown }): string {
  const sets = num(p.sets);
  const lo = num(p.rep_min);
  const hi = num(p.rep_max);
  const rir = num(p.target_rir);
  const reps = lo != null && hi != null ? (lo === hi ? `${lo}` : `${lo}–${hi}`) : null;
  return [sets != null && reps ? `${sets}×${reps}` : sets != null ? `${sets} sets` : null, rir != null ? `@ RIR ${rir}` : null]
    .filter(Boolean)
    .join(" ");
}

function session(
  s: { day: string; session_type: string; target_distance_km: number | null; template_id?: string | null },
  templates: Map<string, string>,
): string {
  const what = (s.template_id && templates.get(s.template_id)) || sessionLabel(s.session_type);
  return `${formatDay(s.day)} · ${what}${s.target_distance_km ? ` ${s.target_distance_km} km` : ""}`;
}

/**
 * What changes, in words: { before, after } (before is null for additions).
 * `error` when the target no longer exists (e.g. the session was deleted);
 * such a proposal can only be rejected.
 */
export function describeProposal(
  kind: string,
  payload: Payload,
  ctx: ProposalContext,
): { before: string | null; after: string; error?: string } {
  const plan = ctx.plans.get(str(payload.plan_id) ?? "");
  const te = ctx.templateExercises.get(str(payload.template_exercise_id) ?? "");
  const exercise = (id: unknown) => ctx.exercises.get(str(id) ?? "") ?? "unknown exercise";
  const template = (id: unknown) => ctx.templates.get(str(id) ?? "") ?? "unknown template";
  const missing = (what: string) => ({ before: null, after: "", error: `The ${what} no longer exists.` });

  switch (kind) {
    case "session_update": {
      if (!plan) return missing("session");
      const next = {
        day: str(payload.day) ?? plan.day,
        session_type: str(payload.session_type) ?? plan.session_type,
        target_distance_km: "target_distance_km" in payload ? num(payload.target_distance_km) : plan.target_distance_km,
        template_id: "template_id" in payload ? str(payload.template_id) : plan.template_id,
      };
      const notes = "notes" in payload && str(payload.notes) ? ` · ${str(payload.notes)}` : "";
      return { before: session(plan, ctx.templates), after: session(next, ctx.templates) + notes };
    }
    case "session_cancel":
      return plan ? { before: session(plan, ctx.templates), after: "cancelled" } : missing("session");
    case "template_exercise_add":
      return { before: null, after: `${template(payload.template_id)}: + ${exercise(payload.exercise_id)} ${prescription(payload)}` };
    case "template_exercise_update":
      if (!te) return missing("exercise");
      return {
        before: `${te.template}: ${te.exercise} ${prescription(te)}`,
        after: `${te.exercise} ${prescription({ ...te, ...payload })}`,
      };
    case "template_exercise_swap":
      if (!te) return missing("exercise");
      return { before: `${te.template}: ${te.exercise}`, after: exercise(payload.exercise_id) };
    case "template_exercise_remove":
      return te ? { before: `${te.template}: ${te.exercise} ${prescription(te)}`, after: "removed" } : missing("exercise");
    case "template_create": {
      const items = Array.isArray(payload.items) ? (payload.items as Payload[]) : [];
      return {
        before: null,
        after: `New template "${str(payload.name) ?? "?"}": ${items.map((i) => `${exercise(i.exercise_id)} ${prescription(i)}`).join(" · ")}`,
      };
    }
    case "template_archive":
      return ctx.templates.has(str(payload.template_id) ?? "")
        ? { before: template(payload.template_id), after: "archived (history kept)" }
        : missing("template");
    default:
      return { before: null, after: "", error: `Unknown change "${kind}".` };
  }
}

/** Plan changes (Week View) vs gym template changes. */
export const isSessionKind = (kind: string) => kind === "session_update" || kind === "session_cancel";

import type { DB } from "@/lib/queries";
import { addDays, mondayOf } from "@/lib/dates";
import { getActiveGoal } from "@/lib/queries";
import { loadSeasons } from "@/lib/season/queries";
import { blockContext } from "@/lib/gym/periodization";
import { loadStrength } from "@/lib/gym/queries";
import { stallQuestions, volumeQuestions, type Question, type QuestionTemplate } from "@/lib/gym/questions";
import { describeProposal, type ProposalContext } from "./proposals";

export type InboxItem = {
  id: string;
  kind: string;
  title: string;
  rationale: string | null;
  source: string;
  created_at: string;
  before: string | null;
  after: string;
  error?: string;
};

/** A decided question isn't asked again for this long. */
export const QUESTION_QUIET_DAYS = 28;
const STALL_HISTORY_DAYS = 70;

/** Open coach proposals (described) and the app's own gym questions. */
export async function loadInbox(supabase: DB, today: string): Promise<{ items: InboxItem[]; questions: Question[] }> {
  const [openRes, keysRes, tplRes, exRes] = await Promise.all([
    supabase.from("coach_proposals").select("*").eq("status", "proposed").order("created_at"),
    supabase
      .from("coach_proposals")
      .select("dedupe_key, status, decided_at")
      .not("dedupe_key", "is", null)
      .or(`status.eq.proposed,decided_at.gte.${addDays(today, -QUESTION_QUIET_DAYS)}`),
    supabase
      .from("workout_templates")
      .select("id, name, archived, template_exercises(id, exercise_id, block, sets, rep_min, rep_max, target_rir)")
      .order("position"),
    supabase
      .from("exercises")
      .select("id, name, primary_muscles, secondary_muscles, mechanic, equipment, measure, archived"),
  ]);
  if (openRes.error) throw openRes.error;
  const open = openRes.data ?? [];
  const templates = tplRes.data ?? [];
  const library = exRes.data ?? [];
  const exName = new Map(library.map((e) => [e.id, e.name]));

  // Context for the proposals' before → after.
  const planIds = open.map((p) => (p.payload as { plan_id?: string })?.plan_id).filter((x): x is string => !!x);
  const plansRes = planIds.length
    ? await supabase.from("weekly_plans").select("id, day, session_type, target_distance_km, template_id").in("id", planIds)
    : { data: [] };
  const ctx: ProposalContext = {
    plans: new Map((plansRes.data ?? []).map((p) => [p.id, { ...p, target_distance_km: p.target_distance_km === null ? null : Number(p.target_distance_km) }])),
    templates: new Map(templates.map((t) => [t.id, t.name])),
    templateExercises: new Map(
      templates.flatMap((t) =>
        t.template_exercises.map((te) => [te.id, { ...te, template: t.name, exercise: exName.get(te.exercise_id) ?? "?" }] as const),
      ),
    ),
    exercises: exName,
  };
  const items: InboxItem[] = open.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    rationale: p.rationale,
    source: p.source,
    created_at: p.created_at,
    ...describeProposal(p.kind, (p.payload ?? {}) as Record<string, unknown>, ctx),
  }));

  // The app's own questions, minus any asked recently.
  const quiet = new Set((keysRes.data ?? []).map((k) => k.dedupe_key));
  const active: QuestionTemplate[] = templates
    .filter((t) => !t.archived)
    .map((t) => ({ id: t.id, name: t.name, items: t.template_exercises }));
  const lib = library.filter((e) => !e.archived);
  const [gymFocus, strength] = await Promise.all([
    getActiveGoal(supabase)
      .then(async (goal) => {
        if (!goal) return null;
        const { approved } = await loadSeasons(supabase, goal.id);
        return approved ? (blockContext(approved.blocks, mondayOf(today))?.gymFocus ?? null) : null;
      })
      .catch(() => null),
    loadStrength(supabase, { from: addDays(today, -STALL_HISTORY_DAYS), to: today }).catch(() => null),
  ]);
  const questions = [
    ...volumeQuestions({ templates: active, library: lib, gymFocus }),
    ...stallQuestions({ templates: active, library: lib, sessions: strength?.sessions ?? [] }),
  ].filter((q) => !quiet.has(q.key));

  return { items, questions };
}

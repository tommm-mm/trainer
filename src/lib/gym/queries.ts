// Loads logged workouts as StrengthSession[] + the exercise index, the
// shared input of strength.ts for the Week View, Stats and the gym logger.

import type { DB } from "@/lib/queries";
import type { ExerciseIndex, StrengthSession } from "@/lib/strength";

export async function loadStrength(
  supabase: DB,
  range: { from: string; to: string },
): Promise<{ sessions: StrengthSession[]; index: ExerciseIndex; activeTemplates: number }> {
  const [wRes, exRes, tplRes] = await Promise.all([
    supabase
      .from("workouts")
      .select(
        "id, date, started_at, finished_at, session_rpe, activity_id, template_id, workout_exercises(exercise_id, block, position, template_exercises(sets, target_rir), workout_sets(weight_kg, reps, duration_s, rir, is_warmup, position))",
      )
      .eq("status", "completed")
      .gte("date", range.from)
      .lte("date", range.to)
      .order("started_at"),
    supabase
      .from("exercises")
      .select("id, name, primary_muscles, secondary_muscles, measure, is_main_lift"),
    supabase.from("workout_templates").select("id", { count: "exact", head: true }).eq("archived", false),
  ]);
  if (wRes.error) throw wRes.error;
  if (exRes.error) throw exRes.error;

  const index: ExerciseIndex = {};
  for (const e of exRes.data ?? []) {
    index[e.id] = {
      name: e.name,
      primary_muscles: e.primary_muscles,
      secondary_muscles: e.secondary_muscles,
      measure: e.measure,
      is_main_lift: e.is_main_lift,
    };
  }

  const sessions: StrengthSession[] = (wRes.data ?? []).map((w) => ({
    id: w.id,
    date: w.date,
    minutes: w.finished_at
      ? Math.round((Date.parse(w.finished_at) - Date.parse(w.started_at)) / 60000)
      : null,
    session_rpe: w.session_rpe,
    activity_id: w.activity_id,
    template_id: w.template_id,
    slots: [...w.workout_exercises]
      .sort((a, b) => a.position - b.position)
      .map((we) => ({
        exercise_id: we.exercise_id,
        block: we.block,
        target: we.template_exercises
          ? { sets: we.template_exercises.sets, rir: we.template_exercises.target_rir }
          : null,
        sets: [...we.workout_sets]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            weight_kg: Number(s.weight_kg),
            reps: s.reps,
            duration_s: s.duration_s,
            rir: s.rir,
            is_warmup: s.is_warmup,
          })),
      })),
  }));

  return { sessions, index, activeTemplates: tplRes.count ?? 0 };
}

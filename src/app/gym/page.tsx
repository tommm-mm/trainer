import { PageShell } from "@/components/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { addDays, mondayOf, todayISO } from "@/lib/dates";
import { loadStrength } from "@/lib/gym/queries";
import {
  storeFromServer,
  type ExerciseInfo,
  type HistoryRow,
  type Measure,
  type ServerWorkout,
  type TemplateInput,
} from "@/lib/gym/workout";
import { GymApp, type RecentWorkout } from "./gym-app";
import { getActiveGoal } from "@/lib/queries";
import { loadSeasons } from "@/lib/season/queries";
import { blockContext, withCoachRules } from "@/lib/gym/periodization";
import { parseRules } from "@/lib/gym/rules";
import { forFocus } from "@/lib/gym/templates";

const HISTORY_DAYS = 180;

export default async function GymPage({ searchParams }: PageProps<"/gym">) {
  const params = await searchParams;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const planned =
    str(params.plan) || str(params.template)
      ? { planId: str(params.plan), templateId: str(params.template) }
      : null;
  const today = todayISO();
  const monday = mondayOf(today);
  const supabase = await createClient();

  const [tplRes, exRes, histRes, activeRes, week, seasonCtx, rulesRes] = await Promise.all([
    supabase
      .from("workout_templates")
      .select(
        "id, name, position, gym_focus, template_exercises(id, exercise_id, block, position, sets, rep_min, rep_max, target_rir, rest_seconds)",
      )
      .eq("archived", false)
      .order("position"),
    supabase
      .from("exercises")
      .select(
        "id, user_id, name, primary_muscles, secondary_muscles, equipment, mechanic, measure, is_main_lift, weight_step_kg",
      )
      .eq("archived", false)
      .order("name"),
    supabase
      .from("workouts")
      .select(
        "id, date, started_at, finished_at, template_id, session_rpe, activity_id, workout_templates(name), workout_exercises(exercise_id, workout_sets(weight_kg, reps, duration_s, rir, is_warmup, position))",
      )
      .eq("status", "completed")
      .gte("date", addDays(today, -HISTORY_DAYS))
      .order("started_at", { ascending: false })
      .limit(60),
    supabase
      .from("workouts")
      .select(
        "*, workout_templates(name), workout_exercises(*, template_exercises(sets, rep_min, rep_max, target_rir, rest_seconds), workout_sets(*))",
      )
      .eq("status", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadStrength(supabase, { from: monday, to: addDays(monday, 6) }).catch(() => null),
    // This week in the approved season: drives the block suggestions (deload, +1 set…).
    getActiveGoal(supabase)
      .then(async (goal) => {
        if (!goal) return null;
        const { approved } = await loadSeasons(supabase, goal.id);
        return approved ? blockContext(approved.blocks, monday) : null;
      })
      .catch(() => null),
    // The coach's rules for this week, if any (they replace the default block rules).
    supabase.from("gym_week_rules").select("rules, note").eq("week_start", monday).maybeSingle(),
  ]);
  const coachRules = rulesRes.data ? { rules: parseRules(rulesRes.data.rules).rules, note: rulesRes.data.note } : null;
  const blockCtx = withCoachRules(seasonCtx, monday, coachRules);
  const loadError = tplRes.error ?? exRes.error ?? histRes.error ?? activeRes.error;

  const templates: TemplateInput[] = (tplRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    items: [...t.template_exercises].sort((a, b) => a.position - b.position),
  }));
  // This block's templates (tagged for its gym focus, or untagged) lead and rotate.
  const blockTemplateIds = forFocus(tplRes.data ?? [], seasonCtx?.gymFocus ?? null).map((t) => t.id);

  const exercises: ExerciseInfo[] = (exRes.data ?? []).map((e) => ({
    ...e,
    measure: e.measure as Measure,
    weight_step_kg: Number(e.weight_step_kg),
  }));

  const workouts = histRes.data ?? [];
  const history: HistoryRow[] = workouts.flatMap((w) =>
    w.workout_exercises.map((we) => ({
      exercise_id: we.exercise_id,
      date: w.date,
      started_at: w.started_at,
      sets: we.workout_sets.map((s) => ({ ...s, weight_kg: Number(s.weight_kg) })),
    })),
  );
  const recent: RecentWorkout[] = workouts.map((w) => ({
    id: w.id,
    date: w.date,
    templateId: w.template_id,
    name: w.workout_templates?.name ?? "Workout",
    sets: w.workout_exercises.reduce(
      (n, we) => n + we.workout_sets.filter((s) => !s.is_warmup).length,
      0,
    ),
    minutes:
      w.finished_at ? Math.round((Date.parse(w.finished_at) - Date.parse(w.started_at)) / 60000) : null,
    sessionRpe: w.session_rpe,
    garmin: w.activity_id !== null,
  }));

  const serverActive = activeRes.data ? storeFromServer(activeRes.data as ServerWorkout) : null;

  return (
    <PageShell active="/gym">
      {loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load data: {loadError.message}
        </p>
      )}
      <GymApp
        today={today}
        templates={templates}
        exercises={exercises}
        history={history}
        recent={recent}
        serverActive={serverActive}
        weekSessions={week?.sessions ?? []}
        index={week?.index ?? {}}
        planned={planned}
        blockCtx={blockCtx}
        blockTemplateIds={blockTemplateIds}
      />
    </PageShell>
  );
}

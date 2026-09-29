// Links completed workouts to the same-day Garmin strength activity (which
// carries duration + HR) and copies the session RPE onto it, so the load
// metrics count the session exactly once. Runs after you finish a workout and
// after every Garmin sync (the watch often uploads later). Plumbing only:
// it never changes what you logged.

import type { DB } from "@/lib/queries";

export type LinkCandidate = { id: string; date: string; duration_min: number | null };

/**
 * Pure matching: each workout gets the longest same-day gym activity not
 * already taken. Workouts are processed in order, so two sessions on one day
 * get two different activities.
 */
export function matchWorkouts(
  workouts: { id: string; date: string }[],
  activities: LinkCandidate[],
  taken: Set<string>,
): { workoutId: string; activityId: string }[] {
  const used = new Set(taken);
  const out: { workoutId: string; activityId: string }[] = [];
  for (const w of workouts) {
    const best = activities
      .filter((a) => a.date === w.date && !used.has(a.id))
      .sort((a, b) => (b.duration_min ?? 0) - (a.duration_min ?? 0))[0];
    if (!best) continue;
    used.add(best.id);
    out.push({ workoutId: w.id, activityId: best.id });
  }
  return out;
}

export async function linkWorkouts(
  supabase: DB,
  range: { from: string; to: string },
): Promise<number> {
  const { data: workouts, error: wErr } = await supabase
    .from("workouts")
    .select("id, date, session_rpe")
    .eq("status", "completed")
    .is("activity_id", null)
    .gte("date", range.from)
    .lte("date", range.to)
    .order("started_at");
  if (wErr) throw wErr;
  if (!workouts?.length) return 0;

  const dates = [...new Set(workouts.map((w) => w.date))];
  const [actsRes, linkedRes] = await Promise.all([
    supabase
      .from("activities")
      .select("id, date, duration_min, rpe, feedback_at")
      .eq("type", "gym")
      .in("date", dates),
    supabase.from("workouts").select("activity_id").not("activity_id", "is", null).in("date", dates),
  ]);
  if (actsRes.error) throw actsRes.error;
  if (linkedRes.error) throw linkedRes.error;

  const acts = actsRes.data ?? [];
  const taken = new Set((linkedRes.data ?? []).map((r) => r.activity_id!));
  const matches = matchWorkouts(workouts, acts, taken);

  for (const m of matches) {
    const { error } = await supabase
      .from("workouts")
      .update({ activity_id: m.activityId })
      .eq("id", m.workoutId);
    if (error) throw error;

    const rpe = workouts.find((w) => w.id === m.workoutId)?.session_rpe ?? null;
    const act = acts.find((a) => a.id === m.activityId);
    if (rpe !== null && act) {
      // The logger's session RPE answers the feedback card's question too.
      const { error: aErr } = await supabase
        .from("activities")
        .update({ rpe, feedback_at: act.feedback_at ?? new Date().toISOString() })
        .eq("id", m.activityId);
      if (aErr) throw aErr;
    }
  }
  return matches.length;
}

// Everything the Today and Plan tabs show for one week, loaded once.
// Moved out of the Week View so both tabs read the same data the same way.
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import { addDays, daysBetween, isISODate, mondayOf, todayISO } from "@/lib/dates";
import { sessionKind, sessionLabel } from "@/lib/sessions";
import { loadStrength } from "@/lib/gym/queries";
import { todayAction } from "@/lib/gym/today";
import { forFocus } from "@/lib/gym/templates";
import { muscleSets } from "@/lib/strength";
import { loadSeasonWeek } from "@/lib/season/queries";
import { loadAthlete, loadWeeks } from "@/lib/athlete";
import { checkWeek, legSets, type Check } from "@/lib/week-checks";
import { loadInbox } from "@/lib/coach/queries";
import { type PlanTemplate } from "./plan-row";
import { syncRow } from "@/lib/health";
import { BASELINE_DAYS, RECENT_DAYS, recoveryStatus } from "@/lib/recovery";


export async function loadWeek(week: string | string[] | undefined) {
  const today = todayISO();
  const monday = mondayOf(typeof week === "string" && isISODate(week) ? week : today);
  const sunday = addDays(monday, 6);
  const isCurrentWeek = monday === mondayOf(today);

  const supabase = await createClient();
  const [
    plansRes,
    activitiesRes,
    flagsRes,
    goal,
    feedbackRes,
    lastCheckinRes,
    templatesRes,
    openWorkoutRes,
    recentWorkoutsRes,
    strength,
  ] = await Promise.all([
    supabase
      .from("weekly_plans")
      .select("*")
      .eq("week_start_date", monday)
      .order("day")
      .order("created_at"),
    supabase
      .from("activities")
      .select("*")
      .gte("date", monday)
      .lte("date", sunday)
      .order("date"),
    supabase
      .from("flags")
      .select("*")
      .eq("resolved", false)
      .order("date", { ascending: false }),
    getActiveGoal(supabase),
    // Synced workouts from the last week still waiting for feedback.
    supabase
      .from("activities")
      .select("*")
      .eq("source", "garmin")
      .is("feedback_at", null)
      .gte("date", addDays(today, -7))
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("checkins")
      .select("date")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_templates")
      .select("id, name, position, gym_focus, template_exercises(position, block, sets, target_rir, exercises(name, primary_muscles))")
      .eq("archived", false)
      .order("position"),
    supabase.from("workouts").select("id").eq("status", "in_progress").limit(1).maybeSingle(),
    supabase
      .from("workouts")
      .select("date, template_id")
      .eq("status", "completed")
      .order("started_at", { ascending: false })
      .limit(5),
    loadStrength(supabase, { from: monday, to: sunday }).catch(() => null),
  ]);

  // This week's targets from the approved season (Season tab), load and time in zones,
  // and the plans of the 2 days either side (spacing checks across the week boundary).
  const [seasonWeek, weekLoad, edgeRes, inbox, wellnessRes, syncRes] = await Promise.all([
    goal ? loadSeasonWeek(supabase, goal.id, monday).catch(() => null) : null,
    loadAthlete(supabase, today)
      .then(async (athlete) => ({ athlete, ...(await loadWeeks(supabase, athlete, [monday], today)) }))
      .catch(() => null),
    supabase
      .from("weekly_plans")
      .select("day, session_type, target_distance_km, template_id")
      .gte("day", addDays(monday, -2))
      .lte("day", addDays(sunday, 2))
      .or(`day.lt.${monday},day.gt.${sunday}`),
    // Coach proposals (plan + gym template changes) and the app's gym questions.
    loadInbox(supabase, today).catch(() => null),
    // Garmin wellness for the recovery card: 7 days + the 28-day baseline.
    supabase
      .from("wellness")
      .select("*")
      .gte("date", addDays(today, -RECENT_DAYS - BASELINE_DAYS))
      .lte("date", today),
    // Health line: warn here when Garmin hasn't synced for a day (details in Settings).
    supabase.from("athlete_settings").select("last_sync_at, last_sync_error").maybeSingle(),
  ]);
  const syncHealth = syncRes.data
    ? syncRow({ lastSyncAt: syncRes.data.last_sync_at, lastSyncError: syncRes.data.last_sync_error }, new Date())
    : null;
  // Before the first stamped sync (no row / no stamp yet) there's nothing to warn about.
  const syncWarning = syncHealth && syncRes.data?.last_sync_at && syncHealth.level !== "ok" ? syncHealth : null;

  const plans = plansRes.data ?? [];
  const activities = activitiesRes.data ?? [];
  const workouts = strength?.sessions ?? [];
  const templates: PlanTemplate[] = (templatesRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    exercises: [...t.template_exercises]
      .filter((e) => e.block === "main")
      .sort((a, b) => a.position - b.position)
      .map((e) => e.exercises?.name ?? "?"),
  }));
  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  // This block's templates (tagged for its gym focus, or untagged): the Today
  // rotation and the leg-heaviest check use these, plus any template planned this week.
  const blockIds = new Set(forFocus(templatesRes.data ?? [], seasonWeek?.block.gym_focus ?? null).map((t) => t.id));
  const blockTemplates = templates.filter((t) => blockIds.has(t.id));
  const plannedIds = new Set([...plans, ...(edgeRes.data ?? [])].map((p) => p.template_id));
  const gymTarget = seasonWeek?.week.gym_sessions ?? Math.max(blockTemplates.length, 1);
  const checks: Check[] = plans.length
    ? checkWeek({
        monday,
        plans: [...plans, ...(edgeRes.data ?? [])],
        templates: (templatesRes.data ?? []).filter((t) => blockIds.has(t.id) || plannedIds.has(t.id)).map((t) => ({
          id: t.id,
          name: t.name,
          legSets: legSets(
            t.template_exercises.map((e) => ({ ...e, primary_muscles: e.exercises?.primary_muscles ?? [] })),
          ),
        })),
        target: seasonWeek?.week ?? null,
      })
    : [];
  const flags = flagsRes.data ?? [];
  const pendingFeedback = feedbackRes.data ?? [];
  const nextFeedback = pendingFeedback[0];
  const loadError = plansRes.error ?? activitiesRes.error ?? flagsRes.error ?? templatesRes.error;
  const proposedCount = plans.filter((p) => p.status === "proposed").length;
  // Gentle nudge when there's no check-in in the last 4 days (today included).
  const lastCheckin = lastCheckinRes.data?.date ?? null;
  const daysSinceCheckin = lastCheckin ? daysBetween(lastCheckin, today) : null;
  const recovery = isCurrentWeek && !wellnessRes.error
    ? recoveryStatus((wellnessRes.data ?? []).map((w) => ({ ...w, hrv: w.hrv === null ? null : Number(w.hrv), vo2max: w.vo2max === null ? null : Number(w.vo2max), ctl: w.ctl === null ? null : Number(w.ctl), atl: w.atl === null ? null : Number(w.atl) })), today)
    : null;
  // The quick check-in shows on the current week until today has one.
  const showQuickCheckin = isCurrentWeek && !lastCheckinRes.error && daysSinceCheckin !== 0;

  const plannedKm = plans.reduce((s, p) => s + (p.target_distance_km ?? 0), 0);
  const doneKm = activities
    .filter((a) => a.type === "run")
    .reduce((s, a) => s + (a.distance_km ?? 0), 0);

  // Gym days this week: logged workouts plus Garmin strength sessions logged elsewhere.
  const gymDates = [
    ...new Set([...workouts.map((w) => w.date), ...activities.filter((a) => a.type === "gym").map((a) => a.date)]),
  ].sort();
  const recentWorkouts = recentWorkoutsRes.data ?? [];
  const lastGymDate =
    [...gymDates.filter((d) => d < today), ...recentWorkouts.filter((w) => w.date < today).map((w) => w.date)]
      .sort()
      .at(-1) ?? null;
  const action = isCurrentWeek
    ? todayAction({
        today,
        inProgress: !!openWorkoutRes.data,
        plannedToday: plans
          .filter((p) => p.day === today && p.status !== "completed" && p.status !== "proposed")
          .map((p) => ({
            id: p.id,
            label: sessionLabel(p.session_type),
            kind: sessionKind(p.session_type),
            templateId: p.template_id,
          })),
        gymDoneToday: gymDates.includes(today),
        runDoneToday: activities.some((a) => a.type === "run" && a.date === today),
        gymDatesThisWeek: gymDates.filter((d) => d <= today),
        lastGymDate,
        gymTarget,
        templates: blockTemplates,
        lastTemplateId: recentWorkouts.find((w) => w.template_id)?.template_id ?? null,
      })
    : null;
  const weekMuscles = strength ? muscleSets(workouts, strength.index) : null;

  return {
    today, monday, sunday, isCurrentWeek, goal, plans, activities, workouts, templates, templateName,
    seasonWeek, weekLoad, inbox, checks, flags, pendingFeedback, nextFeedback, loadError, proposedCount,
    daysSinceCheckin, recovery, showQuickCheckin, plannedKm, doneKm, gymDates, gymTarget, action,
    weekMuscles, syncWarning, lastSyncError: syncRes.data?.last_sync_error ?? null,
  };
}

export type WeekData = Awaited<ReturnType<typeof loadWeek>>;

export type DayState = "done" | "missed" | "changed" | "proposed" | "planned" | "rest";

/**
 * One state per day for the week dots and the Plan calendar: done (anything
 * logged), missed (a past approved session with nothing logged), changed
 * (you edited it), proposed (waiting for your OK), planned, rest.
 */
export function dayState(w: Pick<WeekData, "today" | "plans" | "activities" | "workouts">, day: string): DayState {
  const plans = w.plans.filter((p) => p.day === day);
  const did = w.activities.some((a) => a.date === day && a.type !== "other") || w.workouts.some((x) => x.date === day);
  if (did) return "done";
  if (plans.length === 0) return "rest";
  if (plans.every((p) => p.status === "proposed")) return "proposed";
  if (day < w.today) return "missed";
  return plans.some((p) => p.status === "edited") ? "changed" : "planned";
}

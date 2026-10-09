import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { cardCls, btnSmall } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import type { Tables } from "@/lib/database.types";
import {
  addDays,
  daysBetween,
  formatDay,
  formatWeekRange,
  isISODate,
  mondayOf,
  todayISO,
  weekDays,
} from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { sessionKind, sessionLabel } from "@/lib/sessions";
import { loadStrength } from "@/lib/gym/queries";
import { todayAction } from "@/lib/gym/today";
import { forFocus } from "@/lib/gym/templates";
import { muscleSets, type StrengthSession } from "@/lib/strength";
import { MuscleMeters } from "@/components/muscle-meters";
import { TargetMeters } from "@/components/season-targets";
import { loadSeasonWeek } from "@/lib/season/queries";
import { weeklyActuals } from "@/lib/season/progress";
import { loadAthlete, loadWeeks } from "@/lib/athlete";
import { plannedLoad } from "@/lib/load";
import { LoadMeters } from "@/components/load-meters";
import { checkWeek, legSets, type Check } from "@/lib/week-checks";
import { loadInbox } from "@/lib/coach/queries";
import { CoachInbox } from "@/components/coach-inbox";
import { signOut } from "./actions";
import { approveWeek, resolveFlag } from "./week/actions";
import { PlanRow, type PlanTemplate } from "./week/plan-row";
import { AddSession } from "./week/add-session";
import { SyncButton } from "./week/sync-button";
import { FeedbackCard } from "./week/feedback-card";
import { TodayCard } from "./week/today-card";
import { QuickCheckin } from "./week/quick-checkin";
import { RunDetailView } from "@/components/run-detail";
import { RecoveryCard } from "@/components/recovery-card";
import { BASELINE_DAYS, RECENT_DAYS, recoveryStatus } from "@/lib/recovery";

export default async function WeekPage({ searchParams }: PageProps<"/">) {
  const { week } = await searchParams;
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
  const [seasonWeek, weekLoad, edgeRes, inbox, wellnessRes] = await Promise.all([
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
  ]);

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

  return (
    <PageShell active="/">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isCurrentWeek ? "This week" : "Week"}
          </h1>
          <p className="text-sm text-neutral-400">{formatWeekRange(monday)}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/settings" className="text-xs text-neutral-400 hover:text-neutral-200">
            Settings
          </Link>
          <form action={signOut}>
            <button className="text-xs text-neutral-500 hover:text-neutral-300">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="mb-3">
        <SyncButton />
      </div>

      {action && <TodayCard action={action} templateName={templateName} />}

      <nav className="mb-4 flex items-center gap-2">
        <Link href={`/?week=${addDays(monday, -7)}`} className={btnSmall}>
          ‹ Prev
        </Link>
        {!isCurrentWeek && (
          <Link href="/" className={btnSmall}>
            Today
          </Link>
        )}
        <Link href={`/?week=${addDays(monday, 7)}`} className={btnSmall}>
          Next ›
        </Link>
        <GoalChip goal={goal} today={today} />
      </nav>

      {seasonWeek && (
        <Link href="/season" className={`${cardCls} mb-4 flex flex-col gap-3`}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs uppercase tracking-wide text-emerald-400">
              {seasonWeek.block.name} · week {seasonWeek.weekInBlock}/{seasonWeek.block.weeks.length}
              {seasonWeek.week.is_deload && " · lighter"}
            </p>
            <span className="text-xs text-neutral-500">Season →</span>
          </div>
          <TargetMeters
            targets={seasonWeek.week}
            actual={weeklyActuals(
              activities.map((a) => ({ date: a.date, type: a.type, distance_km: a.distance_km })),
              workouts.map((w) => w.date),
            ).get(monday)}
            finished={sunday < today}
          />
          {seasonWeek.week.key_session && (
            <p className="text-sm text-neutral-300">Key: {seasonWeek.week.key_session}</p>
          )}
          {seasonWeek.week.milestone && <p className="text-sm text-amber-300">⚑ {seasonWeek.week.milestone}</p>}
        </Link>
      )}

      {weekLoad && monday <= today && (
        <section className={`${cardCls} mb-4`}>
          <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            {isCurrentWeek ? "Load this week" : "Load"}
          </p>
          <LoadMeters
            done={weekLoad.loads.get(monday)}
            planned={seasonWeek ? plannedLoad(seasonWeek.week, weekLoad.athlete.calibration) : null}
            zones={weekLoad.zones.get(monday)}
            focus={seasonWeek?.block.focus}
            finished={sunday < today}
          />
        </section>
      )}

      {loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load data: {loadError.message}
        </p>
      )}

      {flags.length > 0 && (
        <section className="mb-4 flex flex-col gap-2">
          {flags.map((f) => (
            <div
              key={f.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
            >
              <div className="text-sm">
                <p className="font-medium text-amber-200">
                  ⚑ {f.type.replace(/_/g, " ")}
                </p>
                <p className="text-amber-100/80">{f.description}</p>
              </div>
              <form action={resolveFlag.bind(null, f.id)}>
                <button className={btnSmall}>Resolve</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {nextFeedback && (
        <section className="mb-4">
          <FeedbackCard
            key={nextFeedback.id}
            activity={{
              id: nextFeedback.id,
              title: nextFeedback.name ?? (nextFeedback.type === "run" ? "Run" : "Strength"),
              subtitle: [
                formatDay(nextFeedback.date),
                nextFeedback.distance_km ? `${formatNumber(nextFeedback.distance_km)} km` : null,
                nextFeedback.avg_pace ? `${nextFeedback.avg_pace}/km` : null,
                nextFeedback.duration_min ? `${formatNumber(nextFeedback.duration_min, 0)} min` : null,
                nextFeedback.avg_hr ? `${nextFeedback.avg_hr} bpm` : null,
              ]
                .filter(Boolean)
                .join(" · "),
            }}
          />
          {pendingFeedback.length > 1 && (
            <p className="mt-1 text-xs text-neutral-500">
              +{pendingFeedback.length - 1} more workout
              {pendingFeedback.length > 2 ? "s" : ""} waiting for feedback
            </p>
          )}
        </section>
      )}

      {recovery && <RecoveryCard status={recovery} today={today} />}
      {showQuickCheckin && <QuickCheckin lastDaysAgo={daysSinceCheckin} />}

      <section className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Planned km" value={formatNumber(plannedKm)} />
        <Stat label="Run km" value={formatNumber(doneKm)} />
        <Stat label="Gym sessions" value={`${gymDates.length}/${gymTarget}`} />
      </section>

      {weekMuscles && workouts.length > 0 && (
        <details className={`${cardCls} mb-4`}>
          <summary className="cursor-pointer text-sm font-medium">
            Muscle volume this week
            <span className="ml-2 text-xs font-normal text-neutral-500">tap to open</span>
          </summary>
          <div className="mt-3">
            <MuscleMeters sets={weekMuscles} />
          </div>
        </details>
      )}

      {inbox && <CoachInbox items={inbox.items} questions={inbox.questions} />}

      {plans.length > 0 && <WeekChecks checks={checks} proposed={proposedCount > 0} />}

      <div className="mb-4 flex gap-2">
        <button
          disabled
          title="Arrives in Phase 4"
          className="flex-1 rounded-lg border border-dashed border-neutral-700 py-2 text-sm text-neutral-500"
        >
          ✦ Generate my week (soon)
        </button>
        {proposedCount > 0 && (
          <form action={approveWeek.bind(null, monday)}>
            <button className="h-full rounded-lg bg-emerald-500 px-3 text-sm font-medium text-neutral-950">
              Approve all ({proposedCount})
              {checks.some((c) => c.severity === "red") && " · ! red check"}
            </button>
          </form>
        )}
      </div>

      <ol className="flex flex-col gap-3">
        {weekDays(monday).map((day) => (
          <DayCard
            key={day}
            day={day}
            isToday={day === today}
            plans={plans.filter((p) => p.day === day)}
            activities={activities.filter((a) => a.date === day)}
            workouts={workouts.filter((w) => w.date === day)}
            templates={templates}
            templateName={templateName}
          />
        ))}
      </ol>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function GoalChip({ goal, today }: { goal: Tables<"goals"> | null; today: string }) {
  if (!goal) {
    return (
      <Link href="/goal" className="ml-auto text-xs text-amber-300">
        No active goal →
      </Link>
    );
  }
  const weeksLeft = goal.target_date
    ? Math.ceil(daysBetween(today, goal.target_date) / 7)
    : null;
  const bits = [
    goal.title,
    goal.phase,
    weeksLeft !== null && weeksLeft >= 0 ? `${weeksLeft} wk` : null,
  ].filter(Boolean);
  return (
    <Link
      href="/goal"
      className="ml-auto truncate rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300"
    >
      {bits.join(" · ")}
    </Link>
  );
}

function DayCard({
  day,
  isToday,
  plans,
  activities,
  workouts,
  templates,
  templateName,
}: {
  day: string;
  isToday: boolean;
  plans: Tables<"weekly_plans">[];
  activities: Tables<"activities">[];
  workouts: StrengthSession[];
  templates: PlanTemplate[];
  templateName: Map<string, string>;
}) {
  const runs = activities.filter((a) => a.type === "run");
  // Garmin strength sessions linked to a logged workout are shown on the workout line.
  const linked = new Map(
    workouts.filter((w) => w.activity_id).map((w) => [w.activity_id!, w]),
  );
  const byId = new Map(activities.map((a) => [a.id, a]));
  const garminGym = activities.filter(
    (a) => (a.type === "gym" || a.type === "cardio") && !linked.has(a.id),
  );
  const hasLogs = runs.length > 0 || garminGym.length > 0 || workouts.length > 0;

  return (
    <li className={`${cardCls} ${isToday ? "border-emerald-500/50" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className={`text-sm font-semibold ${isToday ? "text-emerald-400" : ""}`}>
          {formatDay(day)}
          {isToday && <span className="ml-2 text-xs font-normal">today</span>}
        </h2>
        <Link href={`/log?date=${day}`} className="text-xs text-neutral-500 hover:text-neutral-300">
          + Log run
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {plans.length === 0 && !hasLogs && (
          <p className="text-xs text-neutral-600">Nothing planned.</p>
        )}
        {plans.map((p) => (
          <PlanRow key={p.id} plan={p} templates={templates} />
        ))}

        {hasLogs && (
          <div className="rounded-lg border border-neutral-800 px-3 py-2 text-xs text-neutral-300">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">Logged</p>
            {runs.map((r) => (
              <div key={r.id}>
                <p>
                  🏃 {r.name ? `${r.name} · ` : ""}
                  {formatNumber(r.distance_km)} km
                  {r.avg_pace && ` · ${r.avg_pace}/km`}
                  {r.avg_hr && ` · ${r.avg_hr} bpm`}
                  {r.source === "garmin" && <span className="text-neutral-500"> · Garmin</span>}
                  {r.feeling_score && <span className="text-sky-300"> · feel {r.feeling_score}/10</span>}
                </p>
                <RunDetailView detail={r.run_detail} />
              </div>
            ))}
            {garminGym.map((g) => (
              <p key={g.id}>
                {g.type === "cardio" ? "⚡" : "🏋️"} {g.name ?? (g.type === "cardio" ? "HIIT" : "Strength")}{" "}
                {formatNumber(g.duration_min, 0)} min
                {g.avg_hr && ` · ${g.avg_hr} bpm`}
                <span className="text-neutral-500"> · Garmin</span>
              </p>
            ))}
            {workouts.map((w) => {
              const act = w.activity_id ? byId.get(w.activity_id) : undefined;
              const sets = w.slots.reduce((n, s) => n + s.sets.filter((x) => !x.is_warmup).length, 0);
              return (
                <p key={w.id}>
                  🏋️ {(w.template_id && templateName.get(w.template_id)) || "Workout"} · {sets} sets
                  {w.session_rpe !== null && ` · RPE ${w.session_rpe}`}
                  {act ? (
                    <span className="text-emerald-400">
                      {" "}
                      · ✓ Garmin {formatNumber(act.duration_min, 0)} min{act.avg_hr ? ` · ${act.avg_hr} bpm` : ""}
                    </span>
                  ) : (
                    w.minutes !== null && ` · ${w.minutes} min`
                  )}
                </p>
              );
            })}
          </div>
        )}

        <AddSession day={day} templates={templates} />
      </div>
    </li>
  );
}

/** Your rules on this week's plan: warnings only, the decision stays yours. */
function WeekChecks({ checks, proposed }: { checks: Check[]; proposed: boolean }) {
  if (checks.length === 0) {
    return proposed ? (
      <p className="mb-3 text-xs text-emerald-400">✓ Week checks pass: spacing, gym vs key runs, season targets.</p>
    ) : null;
  }
  return (
    <section className={`${cardCls} mb-4`}>
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        Week checks · {checks.length} to look at
      </p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {checks.map((c, i) => (
          <li key={i} className={c.severity === "red" ? "text-red-300" : "text-amber-200"}>
            <span className="mr-1 font-semibold">{c.severity === "red" ? "✕" : "!"}</span>
            {c.message}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-neutral-500">Checks warn, they don&apos;t decide. Red = safety rule.</p>
    </section>
  );
}

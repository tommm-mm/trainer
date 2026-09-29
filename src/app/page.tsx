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
import { muscleSets, type StrengthSession } from "@/lib/strength";
import { MuscleMeters } from "@/components/muscle-meters";
import { signOut } from "./actions";
import { approveWeek, resolveFlag } from "./week/actions";
import { PlanRow, type PlanTemplate } from "./week/plan-row";
import { AddSession } from "./week/add-session";
import { SyncButton } from "./week/sync-button";
import { FeedbackCard } from "./week/feedback-card";
import { TodayCard } from "./week/today-card";

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
      .select("id, name, position, template_exercises(position, block, exercises(name))")
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
  const flags = flagsRes.data ?? [];
  const pendingFeedback = feedbackRes.data ?? [];
  const nextFeedback = pendingFeedback[0];
  const loadError = plansRes.error ?? activitiesRes.error ?? flagsRes.error ?? templatesRes.error;
  const proposedCount = plans.filter((p) => p.status === "proposed").length;
  // Gentle nudge when there's no check-in in the last 4 days (today included).
  const lastCheckin = lastCheckinRes.data?.date ?? null;
  const daysSinceCheckin = lastCheckin ? daysBetween(lastCheckin, today) : null;
  const showCheckinReminder =
    isCurrentWeek && !lastCheckinRes.error && (daysSinceCheckin === null || daysSinceCheckin >= 4);

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
        gymTarget: Math.max(templates.length, 1),
        templates,
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
        <form action={signOut}>
          <button className="text-xs text-neutral-500 hover:text-neutral-300">
            Sign out
          </button>
        </form>
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

      {showCheckinReminder && (
        <Link
          href="/checkin"
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3"
        >
          <div className="text-sm">
            <p className="font-medium text-emerald-300">How are you feeling?</p>
            <p className="text-xs text-neutral-400">
              {daysSinceCheckin === null
                ? "No check-ins yet. Sleep, soreness and stress help read your training load."
                : `Last check-in ${daysSinceCheckin} days ago. 30 seconds keeps the picture complete.`}
            </p>
          </div>
          <span className="shrink-0 text-xs text-emerald-400">Check in →</span>
        </Link>
      )}

      <section className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="Planned km" value={formatNumber(plannedKm)} />
        <Stat label="Run km" value={formatNumber(doneKm)} />
        <Stat label="Gym sessions" value={`${gymDates.length}/${Math.max(templates.length, 1)}`} />
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
              <p key={r.id}>
                🏃 {r.name ? `${r.name} · ` : ""}
                {formatNumber(r.distance_km)} km
                {r.avg_pace && ` · ${r.avg_pace}/km`}
                {r.avg_hr && ` · ${r.avg_hr} bpm`}
                {r.source === "garmin" && <span className="text-neutral-500"> · Garmin</span>}
                {r.feeling_score && <span className="text-sky-300"> · feel {r.feeling_score}/10</span>}
              </p>
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

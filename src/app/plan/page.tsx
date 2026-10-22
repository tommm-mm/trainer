import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { cardCls, btnSmall } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { addDays, daysBetween, formatDay, formatWeekRange, weekDays } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { type StrengthSession } from "@/lib/strength";
import { MuscleMeters } from "@/components/muscle-meters";
import { TargetMeters } from "@/components/season-targets";
import { weeklyActuals } from "@/lib/season/progress";
import { plannedLoad } from "@/lib/load";
import { LoadMeters } from "@/components/load-meters";
import { type Check } from "@/lib/week-checks";
import { CoachInbox } from "@/components/coach-inbox";
import { approveWeek } from "../week/actions";
import { PlanRow, type PlanTemplate } from "../week/plan-row";
import { AddSession } from "../week/add-session";
import { SyncButton } from "../week/sync-button";
import { RunDetailView } from "@/components/run-detail";

import { loadWeek } from "../week/load";

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { week } = await searchParams;
  const {
    today, monday, sunday, isCurrentWeek, goal, plans, activities, workouts, templates, templateName,
    seasonWeek, weekLoad, inbox, checks, loadError, proposedCount, plannedKm, doneKm, gymDates, gymTarget,
    weekMuscles, syncWarning, lastSyncError,
  } = await loadWeek(week);

  return (
    <PageShell active="/plan">
      <header className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isCurrentWeek ? "This week" : "Week"}
          </h1>
          <p className="text-sm text-neutral-400">{formatWeekRange(monday)}</p>
        </div>
      </header>

      <div className="mb-3">
        <SyncButton stale={syncWarning !== null} />
      </div>

      {syncWarning && (
        <Link
          href="/settings"
          className={`mb-4 block rounded-xl border px-4 py-3 text-sm ${
            syncWarning.level === "red"
              ? "border-red-500/40 bg-red-500/10 text-red-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          Garmin last synced {syncWarning.value}.{lastSyncError ? ` Last attempt failed: ${lastSyncError}` : ""}{" "}
          <span className="text-neutral-400">Settings →</span>
        </Link>
      )}

      <nav className="mb-4 flex items-center gap-2">
        <Link href={`/plan?week=${addDays(monday, -7)}`} className={btnSmall}>
          ‹ Prev
        </Link>
        {!isCurrentWeek && (
          <Link href="/plan" className={btnSmall}>
            This week
          </Link>
        )}
        <Link href={`/plan?week=${addDays(monday, 7)}`} className={btnSmall}>
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

      <div id="proposals" className="scroll-mt-4" />
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

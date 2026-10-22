import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { cardCls } from "@/components/ui";
import type { Tables } from "@/lib/database.types";
import { addDays, formatDay, formatWeekRange, weekDays } from "@/lib/dates";
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
import { RunDetailView } from "@/components/run-detail";

import { dayState, loadWeek, type DayState } from "../week/load";
import { sessionKind, sessionLabel } from "@/lib/sessions";

export default async function PlanPage({ searchParams }: PageProps<"/plan">) {
  const { week, day: dayParam } = await searchParams;
  const w = await loadWeek(week);
  const {
    today, monday, sunday, isCurrentWeek, plans, activities, workouts, templates, templateName,
    seasonWeek, weekLoad, inbox, checks, loadError, proposedCount, plannedKm, doneKm, gymDates, gymTarget,
    weekMuscles, syncWarning, lastSyncError,
  } = w;
  const days = weekDays(monday);
  // The open day: ?day= when it's in this week, else today (this week) or Monday.
  const day = typeof dayParam === "string" && days.includes(dayParam) ? dayParam : isCurrentWeek ? today : monday;
  const weekNo = isoWeek(monday);
  const block = seasonWeek?.block;
  const href = (wk: string, d?: string) => `/plan?week=${wk}${d ? `&day=${d}` : ""}`;

  return (
    <PageShell active="/plan">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-400">{formatWeekRange(monday)}</p>
          <h1 className="text-3xl font-bold tracking-tight">{isCurrentWeek ? "This week" : `Week ${weekNo}`}</h1>
        </div>
        <div className="flex gap-2">
          {!isCurrentWeek && (
            <Link href="/plan" className="flex h-11 items-center rounded-full bg-neutral-900 px-4 text-sm text-neutral-200">
              Today
            </Link>
          )}
          <Link href={href(addDays(monday, -7))} aria-label="Previous week" className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-lg">
            ‹
          </Link>
          <Link href={href(addDays(monday, 7))} aria-label="Next week" className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-lg">
            ›
          </Link>
        </div>
      </header>

      {block && seasonWeek && (
        <Link href="/season" className="mb-4 flex flex-col gap-1.5">
          <div className="flex gap-1">
            {block.weeks.map((bw, i) => (
              <span
                key={bw.id}
                className={`h-1.5 flex-1 rounded-full ${
                  i + 1 === seasonWeek.weekInBlock ? "bg-emerald-400" : i + 1 < seasonWeek.weekInBlock ? "bg-neutral-500" : "bg-neutral-800"
                }`}
              />
            ))}
          </div>
          <p className="flex justify-between text-xs text-neutral-400">
            <span className="font-semibold text-neutral-100">
              {block.name} · week {seasonWeek.weekInBlock}/{block.weeks.length}
              {seasonWeek.week.is_deload && " · lighter"}
            </span>
            <span>Season ›</span>
          </p>
          {seasonWeek.week.key_session && <p className="text-xs text-neutral-300">Key: {seasonWeek.week.key_session}</p>}
          {seasonWeek.week.milestone && <p className="text-xs text-amber-300">⚑ {seasonWeek.week.milestone}</p>}
        </Link>
      )}

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
      {loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load data: {loadError.message}
        </p>
      )}

      <nav aria-label="Days" className="mb-2 grid grid-cols-7 gap-1 rounded-2xl bg-neutral-900 p-2">
        {days.map((d, i) => {
          const state = dayState(w, d);
          const label = shortLabel(plans.filter((p) => p.day === d), activities.filter((a) => a.date === d), workouts.some((x) => x.date === d));
          return (
            <Link
              key={d}
              href={href(monday, d)}
              scroll={false}
              aria-current={d === day ? "date" : undefined}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 ${d === day ? "bg-neutral-800" : ""} ${d === today ? "ring-1 ring-emerald-400" : ""}`}
            >
              <span className="text-[11px] text-neutral-400">{"MTWTFSS"[i]}</span>
              <span className="text-[15px] font-semibold tabular-nums">{Number(d.slice(8))}</span>
              <span className={`rounded-full ${DOT[state]}`} />
              <span className="w-full truncate px-0.5 text-center text-[10px] text-neutral-300">{label}</span>
            </Link>
          );
        })}
      </nav>
      <p className="mb-4 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[11px] text-neutral-400">
        {LEGEND.map(([state, text]) => (
          <span key={state} className="flex items-center gap-1.5">
            <span className={`rounded-full ${DOT[state]}`} />
            {text}
          </span>
        ))}
      </p>

      <ol className="mb-4">
        <DayCard
          day={day}
          isToday={day === today}
          plans={plans.filter((p) => p.day === day)}
          activities={activities.filter((a) => a.date === day)}
          workouts={workouts.filter((x) => x.date === day)}
          templates={templates}
          templateName={templateName}
        />
      </ol>

      <section className="mb-4 flex flex-col gap-3 rounded-2xl bg-neutral-900 p-4">
        <p className="flex justify-between text-[11px] uppercase tracking-wider text-neutral-400">
          <span>Week vs target</span>
          <span className="normal-case tracking-normal">
            {formatNumber(doneKm)} / {formatNumber(seasonWeek?.week.run_km ?? plannedKm)} km · gym {gymDates.length}/{gymTarget}
          </span>
        </p>
        {seasonWeek ? (
          <TargetMeters
            targets={seasonWeek.week}
            actual={weeklyActuals(
              activities.map((a) => ({ date: a.date, type: a.type, distance_km: a.distance_km })),
              workouts.map((x) => x.date),
            ).get(monday)}
            finished={sunday < today}
          />
        ) : (
          <p className="text-sm text-neutral-400">No approved season: planned {formatNumber(plannedKm)} km.</p>
        )}
        {weekLoad && monday <= today && (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-400">Load · 80/20</summary>
            <div className="mt-3">
              <LoadMeters
                done={weekLoad.loads.get(monday)}
                planned={seasonWeek ? plannedLoad(seasonWeek.week, weekLoad.athlete.calibration) : null}
                zones={weekLoad.zones.get(monday)}
                focus={seasonWeek?.block.focus}
                finished={sunday < today}
              />
            </div>
          </details>
        )}
        {weekMuscles && workouts.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-neutral-400">Muscle volume</summary>
            <div className="mt-3">
              <MuscleMeters sets={weekMuscles} />
            </div>
          </details>
        )}
      </section>

      {plans.length > 0 && <WeekChecks checks={checks} proposed={proposedCount > 0} />}

      <div id="proposals" className="scroll-mt-4" />
      {inbox && <CoachInbox items={inbox.items} questions={inbox.questions} />}

      {proposedCount > 0 && (
        <form
          action={approveWeek.bind(null, monday)}
          className="sticky bottom-24 z-10 mb-4 flex items-center justify-between gap-3 rounded-full bg-neutral-100 py-2 pl-5 pr-2 text-neutral-950 shadow-lg shadow-black/50"
        >
          <span className="text-sm font-semibold">
            {proposedCount} session{proposedCount === 1 ? "" : "s"} proposed by your PT
            {checks.some((c) => c.severity === "red") && <span className="text-red-600"> · red check</span>}
          </span>
          <button className="h-10 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-neutral-950">Approve all</button>
        </form>
      )}
    </PageShell>
  );
}

const DOT: Record<DayState, string> = {
  done: "h-2.5 w-2.5 bg-emerald-400",
  changed: "h-2.5 w-2.5 bg-amber-400",
  proposed: "h-2.5 w-2.5 border-2 border-dashed border-emerald-500",
  planned: "h-2.5 w-2.5 border-2 border-neutral-500",
  missed: "h-2.5 w-2.5 bg-red-400",
  rest: "h-2.5 w-2.5",
};
const LEGEND: [DayState, string][] = [
  ["done", "done"],
  ["planned", "planned"],
  ["changed", "changed"],
  ["proposed", "proposed"],
  ["missed", "missed"],
];

/** One word under each day: what's planned (or what was done). */
function shortLabel(plans: Tables<"weekly_plans">[], acts: Tables<"activities">[], gym: boolean): string {
  const p = plans[0];
  if (p) {
    const words: Record<string, string> = { easy_run: "Easy", long_run: "Long", tempo: "Tempo", intervals: "Intervals", recovery_run: "Recov", race: "Race" };
    const kind = sessionKind(p.session_type);
    const base = words[p.session_type] ?? (kind === "gym" ? "Gym" : sessionLabel(p.session_type));
    return plans.length > 1 ? `${base}+` : base;
  }
  if (acts.some((a) => a.type === "run")) return "Run";
  if (gym || acts.some((a) => a.type === "gym")) return "Gym";
  return acts.length ? "Other" : "–";
}

/** ISO week number of a Monday. */
function isoWeek(monday: string): number {
  const d = new Date(`${monday}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
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
    <li className="list-none rounded-2xl bg-neutral-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className={`text-base font-semibold ${isToday ? "text-emerald-400" : ""}`}>
          {formatDay(day)}
          {isToday && <span className="ml-2 text-xs font-normal">today</span>}
        </h2>
        <Link href={`/log?date=${day}`} className="text-xs text-neutral-500 hover:text-neutral-300">
          + Log run
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {plans.length === 0 && !hasLogs && (
          <p className="text-xs text-neutral-600">Rest day: nothing planned.</p>
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

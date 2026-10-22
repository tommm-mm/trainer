import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { btnSmall } from "@/components/ui";
import { formatDay, weekDays } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { readiness } from "@/lib/recovery";
import { resolveFlag } from "./week/actions";
import { SyncButton } from "./week/sync-button";
import { FeedbackCard } from "./week/feedback-card";
import { QuickCheckin } from "./week/quick-checkin";
import { dayState, loadWeek, type WeekData } from "./week/load";
import { ReadinessCard } from "./today/readiness-card";
import { SessionCard } from "./today/session-card";

// Today: am I ready, what do I do, what needs me. The week lives on Plan.
export default async function TodayPage() {
  const w = await loadWeek(undefined);
  const { today, plans, activities, templateName, seasonWeek, inbox, flags, pendingFeedback, nextFeedback } = w;

  const todayPlans = plans.filter((p) => p.day === today && p.status !== "proposed");
  const plan = w.action?.kind === "plan" ? (plans.find((p) => p.id === (w.action as { planId: string }).planId) ?? null) : null;
  const doneToday = activities.filter((a) => a.date === today && a.type !== "other");
  const proposals = (inbox?.items.length ?? 0) + (inbox?.questions.length ?? 0) + w.proposedCount;
  const needs = (proposals > 0 ? 1 : 0) + flags.length + (nextFeedback ? 1 : 0) + (w.showQuickCheckin ? 1 : 0);
  const blockLine = seasonWeek
    ? `${seasonWeek.block.name} · week ${seasonWeek.weekInBlock}/${seasonWeek.block.weeks.length}${seasonWeek.week.is_deload ? " · lighter" : ""}`
    : null;

  return (
    <PageShell active="/">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-400">{formatDay(today)}</p>
          <h1 className="text-3xl font-bold tracking-tight">Today</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-900 text-neutral-300"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </header>

      <div className="mb-3">
        <SyncButton stale={w.syncWarning !== null} />
      </div>
      {w.syncWarning && (
        <Link
          href="/settings"
          className={`mb-4 block rounded-xl border px-4 py-3 text-sm ${
            w.syncWarning.level === "red" ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          Garmin last synced {w.syncWarning.value}.{w.lastSyncError ? ` Last attempt failed: ${w.lastSyncError}` : ""}{" "}
          <span className="text-neutral-400">Settings →</span>
        </Link>
      )}
      {w.loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">Couldn&apos;t load data: {w.loadError.message}</p>
      )}

      <ReadinessCard level={readiness(w.recovery, today)} status={w.recovery} today={today} />

      {w.action && (
        <SessionCard
          action={w.action}
          plan={plan}
          done={doneToday}
          templateName={templateName}
          blockLine={blockLine}
        />
      )}
      {todayPlans.length > 1 && (
        <p className="-mt-2 mb-4 px-1 text-xs text-neutral-400">
          Also today: {todayPlans.filter((p) => p.id !== plan?.id).map((p) => p.session_type.replace(/_/g, " ")).join(", ")}
        </p>
      )}

      {needs > 0 && (
        <section className="mb-4 flex flex-col gap-2.5">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-400">
            Needs you
            <span className="rounded-full bg-amber-400 px-1.5 font-bold tracking-normal text-neutral-950">{needs}</span>
          </p>

          {proposals > 0 && (
            <Link href="/plan#proposals" className="flex items-center gap-3 rounded-2xl bg-neutral-900 p-4">
              <div className="flex-1">
                <p className="text-[15px] font-semibold">PT proposals</p>
                <p className="text-sm text-neutral-400">
                  {proposals} change{proposals === 1 ? "" : "s"} to approve
                </p>
              </div>
              <span className="text-sm font-semibold text-emerald-400">Review ›</span>
            </Link>
          )}

          {flags.map((f) => (
            <div key={f.id} className="flex items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-sm">
                <p className="font-medium text-amber-200">⚑ {f.type.replace(/_/g, " ")}</p>
                <p className="text-amber-100/80">{f.description}</p>
              </div>
              <form action={resolveFlag.bind(null, f.id)}>
                <button className={btnSmall}>Resolve</button>
              </form>
            </div>
          ))}

          {nextFeedback && (
            <div>
              <FeedbackCard
                key={nextFeedback.id}
                activity={{
                  id: nextFeedback.id,
                  title: nextFeedback.name ?? (nextFeedback.type === "run" ? "Run" : "Strength"),
                  subtitle: [
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
                <p className="mt-1 text-xs text-neutral-500">+{pendingFeedback.length - 1} more waiting for feedback</p>
              )}
            </div>
          )}

          {w.showQuickCheckin && <QuickCheckin lastDaysAgo={w.daysSinceCheckin} />}
        </section>
      )}

      <WeekStrip w={w} />
    </PageShell>
  );
}

/** One dot per day: done, planned, missed, rest. Tap → Plan. */
function WeekStrip({ w }: { w: WeekData }) {
  const days = weekDays(w.monday).map((day) => ({ day, state: day === w.today && dayState(w, day) !== "done" ? "today" : dayState(w, day) }));
  const dot: Record<string, string> = {
    done: "h-3.5 w-3.5 bg-emerald-400",
    today: "h-3.5 w-3.5 border-2 border-neutral-100",
    planned: "h-3.5 w-3.5 border-2 border-neutral-600",
    changed: "h-3.5 w-3.5 bg-amber-400",
    proposed: "h-3.5 w-3.5 border-2 border-dashed border-emerald-500",
    missed: "h-3.5 w-3.5 bg-red-400",
    rest: "h-1.5 w-1.5 bg-neutral-700",
  };
  return (
    <Link href="/plan" className="flex flex-col gap-3 rounded-2xl bg-neutral-900 p-4">
      <p className="flex justify-between text-sm">
        <span className="text-neutral-400">This week</span>
        <span className="tabular-nums">
          <b>{formatNumber(w.doneKm)}</b>
          <span className="text-neutral-400">
            {" "}
            / {formatNumber(w.seasonWeek?.week.run_km ?? w.plannedKm)} km · gym {w.gymDates.length}/{w.gymTarget}
          </span>
        </span>
      </p>
      <div className="grid grid-cols-7 text-center text-[11px] text-neutral-400">
        {days.map((d, i) => (
          <div key={d.day} className="flex flex-col items-center gap-1.5">
            <span>{"MTWTFSS"[i]}</span>
            <span className="flex h-3.5 items-center">
              <span className={`rounded-full ${dot[d.state]}`} />
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}

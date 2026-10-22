import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import { daysBetween, formatLongDate, todayISO } from "@/lib/dates";
import { loadAthlete } from "@/lib/athlete";
import { BACKFILL_DAYS } from "@/lib/sync";
import type { RaceParams } from "@/lib/domain";
import { RaceCard } from "../season/race-card";
import { loadForecast } from "../season/forecast";
import { loadStats } from "../analytics/load";
import { ImportHistory } from "../analytics/import-history";
import { StatsGroupView, type StatsGroup } from "../analytics/stats-view";

const TABS: { id: StatsGroup; label: string }[] = [
  { id: "running", label: "Running" },
  { id: "body", label: "Body" },
  { id: "gym", label: "Gym" },
];

// Progress: the race prediction on top, then Running · Body · Gym stats.
// The season plan (blocks, races, efforts) is one tap away on Season.
export default async function ProgressPage({ searchParams }: PageProps<"/progress">) {
  const { tab } = await searchParams;
  const group: StatsGroup = TABS.some((t) => t.id === tab) ? (tab as StatsGroup) : "running";
  const today = todayISO();
  const supabase = await createClient();
  const [goal, athlete, stats] = await Promise.all([getActiveGoal(supabase), loadAthlete(supabase, today), loadStats(today)]);
  const forecast = goal ? await loadForecast(supabase, goal, athlete.anchors, today) : null;
  const daysLeft = goal?.target_date ? daysBetween(today, goal.target_date) : null;
  const race = goal ? ((goal.params as RaceParams).race_name ?? goal.title) : null;

  return (
    <PageShell active="/progress">
      <header className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-400">
            {race ? `${race}${daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft} days` : ""}` : "No active goal"}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Progress</h1>
        </div>
        <Link href="/season" className="pb-1 text-sm text-emerald-400">
          Season plan ›
        </Link>
      </header>

      {stats.loadError && (
        <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          Couldn&apos;t load data: {stats.loadError.message}
        </p>
      )}

      {forecast && race && (
        <div className="mb-4">
          <RaceCard f={forecast} race={race} today={today} />
        </div>
      )}
      {!goal && (
        <Link href="/goal" className="mb-4 block rounded-2xl bg-neutral-900 p-4 text-sm text-amber-300">
          No active goal: set one →
        </Link>
      )}

      <nav aria-label="Stats" className="mb-4 grid grid-cols-3 gap-1 rounded-full bg-neutral-900 p-1">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/progress?tab=${t.id}`}
            scroll={false}
            aria-current={t.id === group ? "page" : undefined}
            className={`flex h-10 items-center justify-center rounded-full text-sm font-semibold ${
              t.id === group ? "bg-neutral-100 text-neutral-950" : "text-neutral-400"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {stats.shortHistory && (
        <ImportHistory days={BACKFILL_DAYS} since={stats.historyStart ? formatLongDate(stats.historyStart) : null} />
      )}

      <StatsGroupView model={stats.model} group={group} />
    </PageShell>
  );
}

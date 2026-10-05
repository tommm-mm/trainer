import { createClient } from "@/lib/supabase/server";
import { getActiveGoal } from "@/lib/queries";
import { addDays, todayISO } from "@/lib/dates";
import { fetchHrSettings } from "@/lib/intervals";
import { resolveHrAnchors } from "@/lib/metrics";
import { flattenWeeks } from "@/lib/season/model";
import { weeklyActuals } from "@/lib/season/progress";
import { historyBefore, loadSeasons } from "@/lib/season/queries";
import { SeasonView } from "./season-view";

export default async function SeasonPage({ searchParams }: PageProps<"/season">) {
  const { view } = await searchParams;
  const today = todayISO();
  const supabase = await createClient();
  const goal = await getActiveGoal(supabase);
  if (!goal) return <SeasonView today={today} goal={null} approved={null} proposed={null} />;

  const { approved, proposed } = await loadSeasons(supabase, goal.id);
  const any = approved ?? proposed;
  if (!any) return <SeasonView today={today} goal={goal} approved={null} proposed={null} />;

  // Done work and history from the earliest week of either version.
  const start = [approved, proposed]
    .filter((s) => s !== null)
    .map((s) => flattenWeeks(s.blocks)[0]?.week_start ?? today)
    .sort()[0];
  const [actsRes, workoutsRes, maxHrRes, hr, history] = await Promise.all([
    supabase.from("activities").select("date, type, distance_km").gte("date", start).lte("date", today),
    supabase.from("workouts").select("date").eq("status", "completed").gte("date", start),
    supabase.from("activities").select("max_hr").not("max_hr", "is", null).order("max_hr", { ascending: false }).limit(1),
    fetchHrSettings(addDays(today, -30), today),
    historyBefore(supabase, start),
  ]);

  return (
    <SeasonView
      today={today}
      goal={goal}
      approved={approved}
      proposed={proposed}
      view={view === "proposed" ? "proposed" : undefined}
      actuals={weeklyActuals(
        (actsRes.data ?? []).map((a) => ({ ...a, distance_km: a.distance_km === null ? null : Number(a.distance_km) })),
        (workoutsRes.data ?? []).map((w) => w.date),
      )}
      anchors={resolveHrAnchors({ garminRest: hr.restHr, garminMax: hr.maxHr, activities: maxHrRes.data ?? [] })}
      history={history}
    />
  );
}

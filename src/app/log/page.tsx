import { PageShell } from "@/components/bottom-nav";
import { btnDanger } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDay, isISODate, todayISO } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { sessionKind, sessionLabel } from "@/lib/sessions";
import { deleteActivity, deleteGymSession } from "./actions";
import { LogForm } from "./log-form";

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const params = await searchParams;
  const planId = typeof params.plan === "string" ? params.plan : null;
  const dateParam = typeof params.date === "string" ? params.date : null;

  const supabase = await createClient();

  const [planRes, activitiesRes, gymRes] = await Promise.all([
    planId
      ? supabase.from("weekly_plans").select("*").eq("id", planId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("activities")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("gym_sessions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const plan = planRes.data;
  const date = plan?.day ?? (isISODate(dateParam) ? dateParam : todayISO());
  const initialMode = plan && sessionKind(plan.session_type) === "gym" ? "gym" : "run";

  // Merge runs/Garmin activities and manual gym rows into one recent list.
  const recent = [
    ...(activitiesRes.data ?? []).map((a) => ({
      id: a.id,
      date: a.date,
      created: a.created_at,
      kind: "activity" as const,
      text:
        a.type === "run"
          ? `🏃 ${formatNumber(a.distance_km)} km${a.avg_pace ? ` · ${a.avg_pace}/km` : ""}${a.rpe ? ` · RPE ${a.rpe}` : ""}`
          : `🏋️ Strength ${formatNumber(a.duration_min, 0)} min`,
      source: a.source,
    })),
    ...(gymRes.data ?? []).map((g) => ({
      id: g.id,
      date: g.date,
      created: g.created_at,
      kind: "gym" as const,
      text: `🏋️ ${g.exercise} ${g.sets ?? "–"}×${g.reps ?? "–"}${g.weight_kg ? ` @ ${formatNumber(g.weight_kg)} kg` : ""}`,
      source: g.garmin_confirmed ? "✓ garmin" : "manual",
    })),
  ]
    .sort((a, b) => (b.date + b.created).localeCompare(a.date + a.created))
    .slice(0, 15);

  return (
    <PageShell active="/log">
      <h1 className="mb-4 text-xl font-semibold tracking-tight">Log workout</h1>

      <LogForm
        // Re-mount when switching between planned sessions.
        key={plan?.id ?? date}
        date={date}
        initialMode={initialMode}
        plan={
          plan && {
            id: plan.id,
            label: `${sessionLabel(plan.session_type)} · ${formatDay(plan.day)}`,
            target_distance_km: plan.target_distance_km,
            target_sets: plan.target_sets,
            notes: plan.notes,
          }
        }
      />

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-neutral-300">Recent</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-neutral-800 rounded-xl border border-neutral-800">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{r.text}</p>
                  <p className="text-xs text-neutral-500">
                    {formatDay(r.date)} · {r.source}
                  </p>
                </div>
                {r.source !== "garmin" && (
                  <form
                    action={(r.kind === "gym" ? deleteGymSession : deleteActivity).bind(null, r.id)}
                  >
                    <button className={btnDanger}>Delete</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}

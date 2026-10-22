import { PageShell } from "@/components/bottom-nav";
import { PageHeader } from "@/components/page-header";
import { btnDanger } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { formatDay, isISODate, todayISO } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { redirect } from "next/navigation";
import { sessionKind, sessionLabel } from "@/lib/sessions";
import { deleteActivity } from "./actions";
import { LogForm } from "./log-form";

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const params = await searchParams;
  const planId = typeof params.plan === "string" ? params.plan : null;
  const dateParam = typeof params.date === "string" ? params.date : null;

  const supabase = await createClient();

  const [planRes, activitiesRes] = await Promise.all([
    planId
      ? supabase.from("weekly_plans").select("*").eq("id", planId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("activities")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const plan = planRes.data;
  // Gym sessions are logged set by set in the gym logger.
  if (plan && sessionKind(plan.session_type) === "gym") {
    redirect(`/gym?plan=${plan.id}${plan.template_id ? `&template=${plan.template_id}` : ""}`);
  }
  const date = plan?.day ?? (isISODate(dateParam) ? dateParam : todayISO());

  const recent = (activitiesRes.data ?? []).map((a) => ({
    id: a.id,
    date: a.date,
    text:
      a.type === "run"
        ? `🏃 ${formatNumber(a.distance_km)} km${a.avg_pace ? ` · ${a.avg_pace}/km` : ""}${a.rpe ? ` · RPE ${a.rpe}` : ""}`
        : `${a.type === "cardio" ? "⚡ HIIT" : "🏋️ Strength"} ${formatNumber(a.duration_min, 0)} min`,
    source: a.source,
  }));

  return (
    <PageShell active="/gym">
      <PageHeader
        back={{ href: "/plan", label: "Plan" }}
        title="Log a run"
        sub="For runs without the watch. Garmin runs sync by themselves; gym sessions go in the Gym tab."
      />

      <LogForm
        // Re-mount when switching between planned sessions.
        key={plan?.id ?? date}
        date={date}
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
          <ul className="divide-y divide-neutral-800 rounded-2xl bg-neutral-900">
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
                    action={deleteActivity.bind(null, r.id)}
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

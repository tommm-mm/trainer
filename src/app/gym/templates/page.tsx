import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { PageHeader } from "@/components/page-header";
import { btnSmall, cardCls } from "@/components/ui";
import { focusLabel } from "@/lib/gym/templates";
import { restoreTemplate } from "./actions";
import { createClient } from "@/lib/supabase/server";
import { NewTemplateForm } from "./forms";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_templates")
    .select("id, name, archived, gym_focus, template_exercises(sets, block, rep_min, rep_max, target_rir)")
    .order("position");
  const active = (data ?? []).filter((t) => !t.archived);
  const archived = (data ?? []).filter((t) => t.archived);

  return (
    <PageShell active="/gym">
      <PageHeader
        back={{ href: "/gym", label: "Gym" }}
        title="Templates"
        sub="Sets × rep range @ RIR per exercise. Workouts started afterwards use the new targets."
      />
      {error && <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error.message}</p>}
      <ul className="mb-6 flex flex-col gap-2">
        {active.map((t) => {
          const main = t.template_exercises.filter((e) => e.block === "main");
          const sets = main.reduce((s, e) => s + e.sets, 0);
          const missing = main.filter((e) => e.rep_max === null || e.target_rir === null).length;
          return (
            <li key={t.id}>
              <Link href={`/gym/templates/${t.id}`} className={`${cardCls} flex items-center justify-between gap-2`}>
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-neutral-400">
                    {main.length} exercises · {sets} working sets
                    {missing > 0 && <span className="text-amber-300"> · {missing} without reps/RIR</span>}
                  </p>
                  <p className="text-xs text-neutral-500">For {focusLabel(t.gym_focus)}</p>
                </div>
                <span className="text-sm text-neutral-500">Edit ›</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">New workout</p>
      <NewTemplateForm />
      {archived.length > 0 && (
        <section className="mt-8">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">Archived (history kept)</p>
          <ul className="flex flex-col divide-y divide-neutral-800 rounded-2xl bg-neutral-900">
            {archived.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  {t.name} <span className="text-xs text-neutral-500">· for {focusLabel(t.gym_focus)}</span>
                </span>
                <form action={restoreTemplate.bind(null, t.id)}>
                  <button className={btnSmall}>Restore</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageShell>
  );
}

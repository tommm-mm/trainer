import Link from "next/link";
import { PageShell } from "@/components/bottom-nav";
import { cardCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { NewTemplateForm } from "./forms";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workout_templates")
    .select("id, name, template_exercises(sets, block, rep_min, rep_max, target_rir)")
    .eq("archived", false)
    .order("position");

  return (
    <PageShell active="/gym">
      <Link href="/gym" className="text-xs text-neutral-500">
        ← Gym
      </Link>
      <h1 className="mb-1 mt-2 text-xl font-semibold tracking-tight">Workouts</h1>
      <p className="mb-4 text-sm text-neutral-400">
        Your templates: sets × rep range @ RIR per exercise. Workouts started afterwards use the new targets.
      </p>
      {error && <p className="mb-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error.message}</p>}
      <ul className="mb-6 flex flex-col gap-2">
        {(data ?? []).map((t) => {
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
                </div>
                <span className="text-sm text-neutral-500">Edit ›</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-neutral-500">New workout</p>
      <NewTemplateForm />
    </PageShell>
  );
}

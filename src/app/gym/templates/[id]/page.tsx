import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/bottom-nav";
import { btnDanger, btnSmall, cardCls } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { archiveTemplate, moveItem, removeItem } from "../actions";
import { AddItemForm, ConfirmForm, FocusForm, ItemForm, RenameForm } from "../forms";

const GROUPS = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core"];

export default async function TemplatePage({ params }: PageProps<"/gym/templates/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [tplRes, exRes] = await Promise.all([
    supabase
      .from("workout_templates")
      .select(
        "id, name, gym_focus, template_exercises(id, position, block, sets, rep_min, rep_max, target_rir, rest_seconds, exercises(name, measure, primary_muscles))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("exercises").select("id, name, primary_muscles").eq("archived", false).order("name"),
  ]);
  const t = tplRes.data;
  if (!t) notFound();

  const items = [...t.template_exercises].sort((a, b) => a.position - b.position);
  const options = GROUPS.map((g) => ({
    group: g.charAt(0).toUpperCase() + g.slice(1),
    items: (exRes.data ?? []).filter((e) => e.primary_muscles[0] === g),
  })).filter((g) => g.items.length > 0);

  return (
    <PageShell active="/gym">
      <Link href="/gym/templates" className="text-xs text-neutral-500">
        ← Workouts
      </Link>
      <div className="mb-4 mt-2">
        <RenameForm id={t.id} name={t.name} />
      </div>
      <section className={`${cardCls} mb-4`}>
        <FocusForm id={t.id} focus={t.gym_focus} />
      </section>

      <ol className="flex flex-col gap-3">
        {items.map((it, i) => (
          <li key={it.id} className={cardCls}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                {it.block === "finisher" && (i === 0 || items[i - 1].block !== "finisher") && (
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-amber-300/80">Finisher · circuit</p>
                )}
                <p className="font-medium">{it.exercises?.name ?? "?"}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <form action={moveItem.bind(null, it.id, t.id, -1)}>
                  <button disabled={i === 0} className={btnSmall} aria-label="Move up">
                    ↑
                  </button>
                </form>
                <form action={moveItem.bind(null, it.id, t.id, 1)}>
                  <button disabled={i === items.length - 1} className={btnSmall} aria-label="Move down">
                    ↓
                  </button>
                </form>
                <form action={removeItem.bind(null, it.id, t.id)}>
                  <button className={btnDanger} aria-label="Remove">
                    ✕
                  </button>
                </form>
              </div>
            </div>
            <ItemForm
              item={{
                id: it.id,
                templateId: t.id,
                sets: it.sets,
                rep_min: it.rep_min,
                rep_max: it.rep_max,
                target_rir: it.target_rir,
                rest_seconds: it.rest_seconds,
                block: it.block,
                measure: it.exercises?.measure ?? "reps",
              }}
            />
          </li>
        ))}
      </ol>

      <section className={`${cardCls} mt-4`}>
        <p className="mb-2 text-sm font-medium">Add an exercise</p>
        <AddItemForm templateId={t.id} options={options} />
      </section>

      <ConfirmForm
        action={archiveTemplate.bind(null, t.id)}
        message={`Archive ${t.name}? It disappears from the Gym tab; logged workouts stay.`}
        className="mt-6 text-center"
      >
        <button className={btnDanger}>Archive this workout</button>
      </ConfirmForm>
    </PageShell>
  );
}

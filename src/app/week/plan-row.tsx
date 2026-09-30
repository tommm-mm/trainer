"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { sessionKind, sessionLabel } from "@/lib/sessions";
import { formatNumber } from "@/lib/format";
import { StatusChip } from "@/components/status-chip";
import { btnDanger, btnPrimary, btnSecondary, btnSmall } from "@/components/ui";
import {
  approvePlan,
  completePlan,
  deletePlan,
  updatePlan,
} from "./actions";
import { SessionFields, type TemplateOption } from "./session-fields";

export type PlanTemplate = TemplateOption & { exercises: string[] };

const KIND_DOT: Record<string, string> = {
  run: "bg-emerald-400",
  gym: "bg-sky-400",
  cross: "bg-violet-400",
  other: "bg-neutral-500",
};

export function PlanRow({
  plan,
  templates,
}: {
  plan: Tables<"weekly_plans">;
  templates: PlanTemplate[];
}) {
  const [editing, setEditing] = useState(false);
  const kind = sessionKind(plan.session_type);

  if (editing) {
    return <EditForm plan={plan} templates={templates} onDone={() => setEditing(false)} />;
  }

  const template = templates.find((t) => t.id === plan.template_id) ?? null;
  const target = [
    plan.target_distance_km ? `${formatNumber(plan.target_distance_km)} km` : null,
    plan.target_sets ? `${plan.target_sets} sets` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-lg bg-neutral-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[kind]}`} />
            {sessionLabel(plan.session_type)}
            {target && (
              <span className="font-normal text-neutral-400">{target}</span>
            )}
          </p>
          {template && (
            <p className="mt-1 text-xs text-neutral-400">
              <span className="text-neutral-300">{template.name}:</span> {template.exercises.join(" · ")}
            </p>
          )}
          {plan.notes && (
            <p className="mt-1 text-xs text-neutral-400">{plan.notes}</p>
          )}
        </div>
        <StatusChip status={plan.status} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {plan.status === "proposed" && (
          <form action={approvePlan.bind(null, plan.id)}>
            <button className={btnSmall}>Approve</button>
          </form>
        )}
        <button className={btnSmall} onClick={() => setEditing(true)}>
          Edit
        </button>
        {plan.status !== "completed" && kind === "gym" && (
          <Link
            href={`/gym?plan=${plan.id}${plan.template_id ? `&template=${plan.template_id}` : ""}`}
            className="rounded-md bg-emerald-500 px-2 py-1 text-xs font-medium text-neutral-950"
          >
            Start workout
          </Link>
        )}
        {plan.status !== "completed" && kind === "run" && (
          <Link href={`/log?plan=${plan.id}`} className={btnSmall}>
            Log it
          </Link>
        )}
        {plan.status !== "completed" && (
          <form action={completePlan.bind(null, plan.id)}>
            <button className={btnSmall}>Done</button>
          </form>
        )}
        <form
          action={deletePlan.bind(null, plan.id)}
          onSubmit={(e) => {
            if (!confirm("Delete this session?")) e.preventDefault();
          }}
          className="ml-auto"
        >
          <button className={btnDanger}>Delete</button>
        </form>
      </div>
    </div>
  );
}

function EditForm({
  plan,
  templates,
  onDone,
}: {
  plan: Tables<"weekly_plans">;
  templates: TemplateOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof updatePlan>[0], form: FormData) => {
      const result = await updatePlan(prev, form);
      if (result.ok) onDone();
      return result;
    },
    { error: null },
  );

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg bg-neutral-950/60 p-3">
      <input type="hidden" name="id" value={plan.id} />
      <input type="hidden" name="status" value={plan.status} />
      <SessionFields defaults={plan} templates={templates} />
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

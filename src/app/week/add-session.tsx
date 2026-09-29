"use client";

import { useActionState, useState } from "react";
import { btnPrimary, btnSecondary } from "@/components/ui";
import { addPlan } from "./actions";
import { SessionFields, type TemplateOption } from "./session-fields";

export function AddSession({ day, templates }: { day: string; templates: TemplateOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    async (prev: Parameters<typeof addPlan>[0], form: FormData) => {
      const result = await addPlan(prev, form);
      if (result.ok) setOpen(false);
      return result;
    },
    { error: null },
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-neutral-500 hover:text-neutral-300"
      >
        + Add session
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2 rounded-lg bg-neutral-950/60 p-3">
      <input type="hidden" name="day" value={day} />
      <SessionFields templates={templates} />
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {pending ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

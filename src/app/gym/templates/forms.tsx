"use client";

import { useActionState } from "react";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";
import { addItem, createTemplate, renameTemplate, updateItem } from "./actions";

const small = "w-full rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-center text-base tabular-nums outline-none focus:border-emerald-500";

export function NewTemplateForm() {
  const [state, action, pending] = useActionState(createTemplate, { error: null });
  return (
    <form action={action} className="flex gap-2">
      <input name="name" placeholder="e.g. Full body D" className={inputCls} required />
      <button disabled={pending} className={`${btnPrimary} shrink-0`}>
        {pending ? "…" : "Create"}
      </button>
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
    </form>
  );
}

export function RenameForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(renameTemplate.bind(null, id), { error: null });
  return (
    <form action={action} className="flex gap-2">
      <input name="name" defaultValue={name} className={`${inputCls} text-lg font-semibold`} required />
      <button disabled={pending} className={`${btnSecondary} shrink-0`}>
        {pending ? "…" : state.ok ? "✓" : "Rename"}
      </button>
    </form>
  );
}

export type ItemValues = {
  id: string;
  templateId: string;
  sets: number;
  rep_min: number | null;
  rep_max: number | null;
  target_rir: number | null;
  rest_seconds: number | null;
  block: string;
  measure: string;
};

/** Sets × rep range @ RIR, rest and block for one exercise; saves on "Save". */
export function ItemForm({ item }: { item: ItemValues }) {
  const [state, action, pending] = useActionState(updateItem, { error: null });
  const reps = item.measure === "reps";
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="template_id" value={item.templateId} />
      <div className="grid grid-cols-5 gap-1.5">
        <label className={labelCls}>
          Sets
          <input name="sets" inputMode="numeric" defaultValue={item.sets} className={small} />
        </label>
        {reps ? (
          <>
            <label className={labelCls}>
              Reps min
              <input name="rep_min" inputMode="numeric" defaultValue={item.rep_min ?? ""} className={small} />
            </label>
            <label className={labelCls}>
              Reps max
              <input name="rep_max" inputMode="numeric" defaultValue={item.rep_max ?? ""} className={small} />
            </label>
            <label className={labelCls}>
              RIR
              <input name="target_rir" inputMode="numeric" defaultValue={item.target_rir ?? ""} className={small} />
            </label>
          </>
        ) : (
          <p className="col-span-3 self-end pb-2 text-xs text-neutral-500">Timed: log seconds in the workout.</p>
        )}
        <label className={labelCls}>
          Rest s
          <input name="rest_seconds" inputMode="numeric" defaultValue={item.rest_seconds ?? ""} placeholder="auto" className={small} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <select name="block" defaultValue={item.block} className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm">
          <option value="main">Main work</option>
          <option value="finisher">Finisher</option>
        </select>
        <button disabled={pending} className={`${btnPrimary} ml-auto`}>
          {pending ? "Saving…" : state.ok ? "Saved ✓" : "Save"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
    </form>
  );
}

export function AddItemForm({
  templateId,
  options,
}: {
  templateId: string;
  options: { group: string; items: { id: string; name: string }[] }[];
}) {
  const [state, action, pending] = useActionState(addItem.bind(null, templateId), { error: null });
  return (
    <form action={action} className="flex flex-col gap-2">
      <select name="exercise_id" required defaultValue="" className={inputCls}>
        <option value="" disabled>
          Choose an exercise…
        </option>
        {options.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="flex gap-2">
        <select name="block" defaultValue="main" className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-sm">
          <option value="main">Main work</option>
          <option value="finisher">Finisher</option>
        </select>
        <button disabled={pending} className={`${btnPrimary} ml-auto`}>
          {pending ? "Adding…" : "+ Add exercise"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      <p className="text-[11px] text-neutral-500">
        Missing one? Create it during a workout (+ Add exercise → Create); it then appears here.
      </p>
    </form>
  );
}

/** A server-action form that asks before submitting. */
export function ConfirmForm({
  action,
  message,
  children,
  className,
}: {
  action: () => Promise<void>;
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}

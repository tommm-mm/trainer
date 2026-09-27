"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionState } from "@/lib/form";
import { GOAL_TYPES, GOAL_TYPE_LABELS, PHASES, type GoalType } from "@/lib/domain";
import { btnPrimary, btnSmall, inputCls, labelCls } from "@/components/ui";
import { createGoal, updateRaceProgress } from "./actions";

/** A button that runs a no-arg server action and shows its error, if any. */
export function ActionButton({
  action,
  children,
  confirmText,
  className = btnSmall,
}: {
  action: () => Promise<ActionState>;
  children: React.ReactNode;
  confirmText?: string;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirmText && !confirm(confirmText)) return;
          startTransition(async () => {
            const res = await action();
            setError(res.error);
          });
        }}
      >
        {pending ? "…" : children}
      </button>
      {error && <span className="mt-1 text-xs text-red-400">{error}</span>}
    </span>
  );
}

export function RaceProgressForm({
  id,
  phase,
  buildWeek,
  deload,
}: {
  id: string;
  phase: string | null;
  buildWeek: number | null;
  deload: boolean;
}) {
  const [state, action, pending] = useActionState(updateRaceProgress, { error: null });

  return (
    <form action={action} className="grid grid-cols-3 items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label className={labelCls}>
        Phase
        <select name="phase" defaultValue={phase ?? "base"} className={inputCls}>
          {PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Build week
        <input
          name="build_week_number"
          inputMode="numeric"
          defaultValue={buildWeek ?? ""}
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-2 pb-2.5 text-xs text-neutral-300">
        <input type="checkbox" name="deload_week" defaultChecked={deload} className="h-4 w-4" />
        Deload
      </label>
      <button disabled={pending} className={`${btnSmall} col-span-3 justify-self-start`}>
        {pending ? "Saving…" : state.ok ? "Saved ✓" : "Save"}
      </button>
      {state.error && <p className="col-span-3 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}

export function NewGoalForm() {
  const [type, setType] = useState<GoalType>("race");
  const [state, action, pending] = useActionState(createGoal, { error: null });

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="goal_type" value={type} />
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-950 p-1 text-xs">
        {GOAL_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`rounded-md py-2 ${
              type === t ? "bg-neutral-700 font-medium" : "text-neutral-400"
            }`}
          >
            {GOAL_TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      <label className={labelCls}>
        Title *
        <input name="title" required className={inputCls} placeholder={PLACEHOLDERS[type]} />
      </label>
      <label className={labelCls}>
        {type === "race" ? "Race date *" : "Target date (optional)"}
        <input type="date" name="target_date" required={type === "race"} className={inputCls} />
      </label>

      {type === "race" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Distance (km)
              <input name="distance_km" inputMode="decimal" placeholder="42.2" className={inputCls} />
            </label>
            <label className={labelCls}>
              Target time
              <input name="target_time" placeholder="3:30:00" className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            Tune-up races (one per line: Name, YYYY-MM-DD)
            <textarea name="tune_up_races" rows={2} className={inputCls} />
          </label>
        </>
      )}

      {type === "strength" && (
        <>
          <label className={labelCls}>
            Focus lifts (comma separated)
            <input name="focus_lifts" placeholder="Back squat, Deadlift" className={inputCls} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Target weight (kg)
              <input name="target_weight_kg" inputMode="decimal" className={inputCls} />
            </label>
            <label className={labelCls}>
              Target reps
              <input name="target_reps" inputMode="numeric" className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            Description
            <textarea name="description" rows={2} className={inputCls} />
          </label>
        </>
      )}

      {type === "body_composition" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              Target weight (kg)
              <input name="target_weight_kg" inputMode="decimal" className={inputCls} />
            </label>
            <label className={labelCls}>
              Target body fat %
              <input name="target_body_fat_pct" inputMode="decimal" className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            Direction
            <select name="direction" className={inputCls}>
              <option value="lose">Lose</option>
              <option value="gain">Gain</option>
              <option value="recomp">Recomp</option>
            </select>
          </label>
        </>
      )}

      {type === "general_fitness" && (
        <label className={labelCls}>
          What does success look like?
          <textarea
            name="description"
            rows={3}
            placeholder="Stay consistent, feel good, avoid injury."
            className={inputCls}
          />
        </label>
      )}

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button disabled={pending} className={`${btnPrimary} py-2.5`}>
        {pending ? "Creating…" : "Start goal"}
      </button>
    </form>
  );
}

const PLACEHOLDERS: Record<GoalType, string> = {
  race: "Padova Marathon",
  strength: "Add 10 kg to my squat",
  body_composition: "Lean out to 72 kg",
  general_fitness: "Stay fit this semester",
};

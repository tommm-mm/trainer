"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/form";
import type { WeekTargets } from "@/lib/season/model";
import { btnSmall, inputCls, labelCls } from "@/components/ui";
import { addRace, setThresholdHr, updateSeasonWeek } from "./actions";

export function WeekEditForm({ id, week }: { id: string; week: WeekTargets }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSeasonWeek, { error: null });
  return (
    <form action={action} className="mt-2 grid grid-cols-5 gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="week_start" value={week.week_start} />
      <label className={labelCls}>
        km
        <input name="run_km" inputMode="decimal" defaultValue={week.run_km ?? ""} className={inputCls} />
      </label>
      <label className={labelCls}>
        Long
        <input name="long_run_km" inputMode="decimal" defaultValue={week.long_run_km ?? ""} className={inputCls} />
      </label>
      <label className={labelCls}>
        Runs
        <input name="runs" inputMode="numeric" defaultValue={week.runs ?? ""} className={inputCls} />
      </label>
      <label className={labelCls}>
        Gym
        <input name="gym_sessions" inputMode="numeric" defaultValue={week.gym_sessions ?? ""} className={inputCls} />
      </label>
      <label className={labelCls}>
        Bike
        <input name="cross_sessions" inputMode="numeric" defaultValue={week.cross_sessions ?? ""} className={inputCls} />
      </label>
      <label className={`${labelCls} col-span-5`}>
        Load target (AU, blank = estimate)
        <input name="load_target" inputMode="numeric" defaultValue={week.load_target ?? ""} className={inputCls} />
      </label>
      <label className={`${labelCls} col-span-5`}>
        Key session
        <input name="key_session" defaultValue={week.key_session ?? ""} className={inputCls} />
      </label>
      <label className={`${labelCls} col-span-5`}>
        Notes
        <input name="notes" defaultValue={week.notes ?? ""} className={inputCls} />
      </label>
      <label className="col-span-3 flex items-center gap-2 text-xs text-neutral-300">
        <input type="checkbox" name="is_deload" defaultChecked={!!week.is_deload} className="h-4 w-4" />
        Lighter week
      </label>
      <button disabled={pending} className={`${btnSmall} col-span-2 justify-self-end`}>
        {pending ? "Saving…" : state.ok ? "Saved ✓" : "Save week"}
      </button>
      {state.error && <p className="col-span-5 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}

export function AddRaceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addRace, { error: null });
  return (
    <form action={action} className="mt-2 grid grid-cols-2 gap-2">
      <label className={`${labelCls} col-span-2`}>
        Race
        <input name="name" placeholder="e.g. 10 km Firenze" className={inputCls} />
      </label>
      <label className={labelCls}>
        Date
        <input name="date" type="date" className={inputCls} />
      </label>
      <label className={labelCls}>
        Distance (km)
        <input name="distance_km" inputMode="decimal" className={inputCls} />
      </label>
      <label className={labelCls}>
        Priority
        <select name="priority" defaultValue="C" className={inputCls}>
          <option value="B">B · important, 3–4 easy days before</option>
          <option value="C">C · by feel, no taper</option>
        </select>
      </label>
      <button disabled={pending} className={`${btnSmall} self-end justify-self-end`}>
        {pending ? "Adding…" : state.ok ? "Added ✓" : "Add race"}
      </button>
      {state.error && <p className="col-span-2 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}

/** Threshold HR from a test: re-centres the zones. Only you set it. */
export function ThresholdForm({ threshold, date }: { threshold: number | null; date: string | null }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setThresholdHr, { error: null });
  return (
    <form action={action} className="mt-2 grid grid-cols-5 gap-2">
      <label className={`${labelCls} col-span-2`}>
        Threshold HR
        <input name="threshold_hr" inputMode="numeric" placeholder="e.g. 174" defaultValue={threshold ?? ""} className={inputCls} />
      </label>
      <label className={`${labelCls} col-span-2`}>
        Test date
        <input name="threshold_date" type="date" defaultValue={date ?? ""} className={inputCls} />
      </label>
      <button disabled={pending} className={`${btnSmall} self-end`}>
        {pending ? "…" : state.ok ? "Saved ✓" : "Save"}
      </button>
      <p className="col-span-5 text-[11px] text-neutral-500">Leave the HR blank and save to go back to the default zones.</p>
      {state.error && <p className="col-span-5 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}

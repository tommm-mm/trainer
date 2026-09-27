"use client";

import { useActionState, useState } from "react";
import { paceFromRun } from "@/lib/format";
import { btnPrimary, btnSmall, inputCls, labelCls } from "@/components/ui";
import { logWorkout } from "./actions";

type Plan = {
  id: string;
  label: string;
  target_distance_km: number | null;
  target_sets: number | null;
  notes: string | null;
};

export function LogForm({
  date,
  initialMode,
  plan,
}: {
  date: string;
  initialMode: "run" | "gym";
  plan: Plan | null;
}) {
  const [mode, setMode] = useState(initialMode);
  const [state, action, pending] = useActionState(logWorkout, { error: null });
  const [distance, setDistance] = useState(
    plan?.target_distance_km ? String(plan.target_distance_km) : "",
  );
  const [duration, setDuration] = useState("");
  // Stable keys for the dynamic exercise rows.
  const [rows, setRows] = useState([0]);

  const pace = paceFromRun(
    Number(distance.replace(",", ".")),
    Number(duration.replace(",", ".")),
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />
      {plan && <input type="hidden" name="plan_id" value={plan.id} />}

      {plan && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm">
          <p className="font-medium text-sky-200">Planned: {plan.label}</p>
          <p className="text-sky-100/80">
            {[
              plan.target_distance_km && `${plan.target_distance_km} km`,
              plan.target_sets && `${plan.target_sets} sets`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {plan.notes && <p className="mt-1 text-xs text-sky-100/70">{plan.notes}</p>}
        </div>
      )}

      <div className="grid grid-cols-2 rounded-lg bg-neutral-900 p-1 text-sm">
        {(["run", "gym"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-md py-2 capitalize ${
              mode === m ? "bg-neutral-700 font-medium" : "text-neutral-400"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <label className={labelCls}>
        Date
        <input type="date" name="date" defaultValue={date} required className={inputCls} />
      </label>

      {mode === "run" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            Distance (km) *
            <input
              name="distance_km"
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Duration (min) *
            <input
              name="duration_min"
              inputMode="decimal"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={inputCls}
            />
          </label>
          <p className="col-span-2 -mt-1 text-xs text-neutral-400">
            Pace: <span className="tabular-nums text-neutral-200">{pace ? `${pace} /km` : "–"}</span>
          </p>
          <label className={labelCls}>
            Avg HR
            <input name="avg_hr" inputMode="numeric" className={inputCls} />
          </label>
          <label className={labelCls}>
            Max HR
            <input name="max_hr" inputMode="numeric" className={inputCls} />
          </label>
          <label className={labelCls}>
            Elevation (m)
            <input name="elevation_m" inputMode="numeric" className={inputCls} />
          </label>
          <label className={labelCls}>
            RPE (1-10)
            <input name="rpe" inputMode="numeric" className={inputCls} />
          </label>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((key, i) => (
            <fieldset
              key={key}
              className="grid grid-cols-4 gap-2 rounded-lg border border-neutral-800 p-3"
            >
              <label className={`${labelCls} col-span-3`}>
                Exercise
                <input name="exercise" placeholder="Back squat" className={inputCls} />
              </label>
              <div className="flex items-end justify-end">
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows(rows.filter((r) => r !== key))}
                    className="px-2 py-2 text-xs text-red-400"
                    aria-label={`Remove exercise ${i + 1}`}
                  >
                    ✕
                  </button>
                )}
              </div>
              <label className={labelCls}>
                Sets
                <input
                  name="sets"
                  inputMode="numeric"
                  defaultValue={i === 0 && plan?.target_sets ? plan.target_sets : ""}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Reps
                <input name="reps" inputMode="numeric" className={inputCls} />
              </label>
              <label className={labelCls}>
                kg
                <input name="weight_kg" inputMode="decimal" className={inputCls} />
              </label>
              <label className={labelCls}>
                RPE
                <input name="gym_rpe" inputMode="numeric" className={inputCls} />
              </label>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, Math.max(-1, ...rows) + 1])}
            className={`${btnSmall} self-start`}
          >
            + Add exercise
          </button>
        </div>
      )}

      {plan && (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" name="mark_completed" defaultChecked className="h-4 w-4" />
          Mark planned session as completed
        </label>
      )}

      {state.error && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <button disabled={pending} className={`${btnPrimary} py-2.5`}>
        {pending ? "Saving…" : `Save ${mode}`}
      </button>
    </form>
  );
}

"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { btnPrimary, inputCls, labelCls } from "@/components/ui";
import { isISODate } from "@/lib/dates";
import { CalfNiggleFields } from "@/components/calf-niggle";
import { saveCheckin } from "./actions";

export type CheckinValues = {
  feeling_text: string | null;
  feeling_score: number | null;
  sleep_hours: number | null;
  soreness: number | null;
  stress: number | null;
  notes: string | null;
  calf_score: number | null;
  niggle: string | null;
  weight_kg: number | null;
  body_fat_pct: number | null;
};

export function CheckinForm({
  date,
  today,
  values,
  isEdit,
  showBodyFat,
}: {
  date: string;
  today: string;
  values: CheckinValues;
  isEdit: boolean;
  /** Body-composition goal: weight + body fat up front. Otherwise weight is optional, tucked away. */
  showBodyFat: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveCheckin, { error: null });

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className={labelCls}>
        Date
        <input
          type="date"
          name="date"
          defaultValue={date}
          max={today}
          className={inputCls}
          // Switching date loads that day's check-in, so you edit what's saved.
          onChange={(e) => {
            if (isISODate(e.target.value)) router.replace(`/checkin?date=${e.target.value}`);
          }}
        />
      </label>

      <label className={labelCls}>
        How do you feel?
        <textarea
          name="feeling_text"
          rows={2}
          defaultValue={values.feeling_text ?? ""}
          placeholder="Fresh, a bit tight in the calves…"
          className={inputCls}
        />
      </label>

      <Scale name="feeling_score" label="Overall feeling" low="awful" high="great" value={values.feeling_score} />
      <Scale name="soreness" label="Muscle soreness" low="none" high="very sore" value={values.soreness} />
      <Scale name="stress" label="Stress" low="calm" high="very stressed" value={values.stress} />

      <CalfNiggleFields calf={values.calf_score} niggle={values.niggle} />

      <label className={labelCls}>
        Sleep last night (hours)
        <input
          name="sleep_hours"
          inputMode="decimal"
          defaultValue={values.sleep_hours ?? ""}
          placeholder="7.5"
          className={inputCls}
        />
      </label>

      {showBodyFat ? (
        <BodyFields values={values} showBodyFat />
      ) : (
        <details
          open={values.weight_kg !== null}
          className="rounded-lg border border-neutral-800 px-3 py-2"
        >
          <summary className="cursor-pointer text-xs text-neutral-400">
            + Weight (optional)
          </summary>
          <div className="mt-2">
            <BodyFields values={values} showBodyFat={false} />
          </div>
        </details>
      )}

      <label className={labelCls}>
        Notes
        <textarea
          name="notes"
          rows={2}
          defaultValue={values.notes ?? ""}
          placeholder="Busy exam week, travelled Friday…"
          className={inputCls}
        />
      </label>

      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && !pending && <p className="text-sm text-emerald-400">Saved ✓</p>}

      <button disabled={pending} className={`${btnPrimary} py-2.5`}>
        {pending ? "Saving…" : isEdit ? "Update check-in" : "Save check-in"}
      </button>
    </form>
  );
}

function BodyFields({ values, showBodyFat }: { values: CheckinValues; showBodyFat: boolean }) {
  return (
    <div className={`grid gap-2 ${showBodyFat ? "grid-cols-2" : "grid-cols-1"}`}>
      <label className={labelCls}>
        Weight (kg)
        <input
          name="weight_kg"
          inputMode="decimal"
          defaultValue={values.weight_kg ?? ""}
          placeholder="72.4"
          className={inputCls}
        />
      </label>
      {showBodyFat && (
        <label className={labelCls}>
          Body fat (%)
          <input
            name="body_fat_pct"
            inputMode="decimal"
            defaultValue={values.body_fat_pct ?? ""}
            placeholder="14"
            className={inputCls}
          />
        </label>
      )}
      {/* Keep a previously saved body-fat value when the field is hidden. */}
      {!showBodyFat && values.body_fat_pct !== null && (
        <input type="hidden" name="body_fat_pct" value={values.body_fat_pct} />
      )}
    </div>
  );
}

/** 1–10 tap scale (radio buttons). Tapping the selected value clears it. */
function Scale({
  name,
  label,
  low,
  high,
  value,
}: {
  name: string;
  label: string;
  low: string;
  high: string;
  value: number | null;
}) {
  const [selected, setSelected] = useState<number | null>(value);
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 flex w-full justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <span className="tabular-nums text-neutral-300">{selected ?? "–"}/10</span>
      </legend>
      <input type="hidden" name={name} value={selected ?? ""} />
      <div className="grid grid-cols-10 gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={selected === n}
            onClick={() => setSelected(selected === n ? null : n)}
            className={`h-9 rounded-md text-sm tabular-nums transition ${
              selected === n
                ? "bg-emerald-500 font-semibold text-neutral-950"
                : "border border-neutral-800 bg-neutral-900 text-neutral-300"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-neutral-600">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

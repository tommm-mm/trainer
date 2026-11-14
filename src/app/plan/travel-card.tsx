"use client";

import { useActionState, useState } from "react";
import { btnPrimary, btnSmall, inputCls, labelCls } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { TRAVEL_LABEL, type TravelKind } from "@/lib/week-checks";
import type { Trip } from "../week/load";
import { addTrip, approveTrip, deleteTrip } from "./travel-actions";

const HINT: Record<TravelKind, string> = {
  off: "no training",
  transit: "travel day, no training",
  no_gym: "running only",
  limited: "short sessions, no long or hard runs",
};

/** Travel mode on Plan: your trips, the PT's proposed ones, and a form to add one. */
export function TravelCard({ trips, today }: { trips: Trip[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addTrip, { error: null });
  const proposed = trips.filter((t) => t.status === "proposed");
  const range = (t: Trip) => (t.start_date === t.end_date ? formatDay(t.start_date) : `${formatDay(t.start_date)} – ${formatDay(t.end_date)}`);

  return (
    <section id="travel" className="mb-4 flex scroll-mt-4 flex-col gap-3 rounded-2xl bg-neutral-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-neutral-400">
          ✈ Travel
          {proposed.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-400 px-1.5 font-bold tracking-normal text-neutral-950">{proposed.length}</span>
          )}
        </p>
        <button onClick={() => setOpen(!open)} className={btnSmall} aria-expanded={open}>
          {open ? "Close" : "+ Add trip"}
        </button>
      </div>

      {trips.length === 0 && !open && <p className="text-sm text-neutral-400">No trips coming up.</p>}

      {trips.length > 0 && (
        <ul className="flex flex-col gap-2">
          {trips.map((t) => (
            <li key={t.id} className={`rounded-xl p-3 text-sm ${t.status === "proposed" ? "border border-amber-500/40 bg-amber-500/5" : "bg-neutral-950"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {range(t)} · {TRAVEL_LABEL[t.kind]}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {[t.note, HINT[t.kind], t.status === "proposed" ? "proposed by your PT" : t.end_date < today ? "past" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {t.status === "proposed" && (
                    <form action={approveTrip.bind(null, t.id)}>
                      <button className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-neutral-950">Approve</button>
                    </form>
                  )}
                  <form action={deleteTrip.bind(null, t.id)}>
                    <button className={btnSmall}>{t.status === "proposed" ? "Reject" : "Remove"}</button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <form action={action} className="flex flex-col gap-3 border-t border-neutral-800 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={labelCls}>
              From
              <input type="date" name="start_date" required defaultValue={today} className={inputCls} />
            </label>
            <label className={labelCls}>
              To
              <input type="date" name="end_date" defaultValue={today} className={inputCls} />
            </label>
          </div>
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-xs text-neutral-400">Type</legend>
            {(Object.keys(TRAVEL_LABEL) as TravelKind[]).map((k, i) => (
              <label key={k} className="flex cursor-pointer items-start gap-2 rounded-xl bg-neutral-950 p-2.5 text-sm has-[:checked]:ring-1 has-[:checked]:ring-emerald-400">
                <input type="radio" name="kind" value={k} defaultChecked={i === 2} className="mt-1 accent-emerald-500" />
                <span>
                  {TRAVEL_LABEL[k]}
                  <span className="block text-[11px] text-neutral-400">{HINT[k]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <label className={labelCls}>
            Note (optional)
            <input name="note" maxLength={200} placeholder="e.g. Padova, hotel gym?" className={inputCls} />
          </label>
          {state.error && <p className="text-xs text-red-400">{state.error}</p>}
          {state.ok && <p className="text-xs text-emerald-400">Saved. The week checks now plan around it.</p>}
          <button disabled={pending} className={btnPrimary}>
            {pending ? "Saving…" : "Save trip"}
          </button>
          <p className="text-[11px] text-neutral-500">
            One trip can be a single day: add a travel day, then the days after with their own type. Overlaps: the strictest type wins.
          </p>
        </form>
      )}
    </section>
  );
}

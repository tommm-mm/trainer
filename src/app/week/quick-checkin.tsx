"use client";

import { useActionState } from "react";
import Link from "next/link";
import { btnPrimary } from "@/components/ui";
import { CalfNiggleFields } from "@/components/calf-niggle";
import { quickCheckin } from "@/app/checkin/actions";

/** The 10-second check-in on the Week View: calves 0–3 and a niggle, for today. */
export function QuickCheckin({ lastDaysAgo }: { lastDaysAgo: number | null }) {
  const [state, action, pending] = useActionState(quickCheckin, { error: null });
  if (state.ok) return null;
  return (
    <form action={action} className="mb-4 flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-emerald-300">How are your legs today?</p>
          <p className="text-xs text-neutral-400">
            10 seconds.{" "}
            {lastDaysAgo === null ? "No check-ins yet." : lastDaysAgo === 1 ? "Last one yesterday." : `Last one ${lastDaysAgo} days ago.`}{" "}
            Calves 2+ or a niggle goes to your coach as a flag.
          </p>
        </div>
        <Link href="/checkin" className="shrink-0 text-xs text-emerald-400">
          Full check-in →
        </Link>
      </div>
      <CalfNiggleFields calf={null} niggle={null} />
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      <button disabled={pending} className={`${btnPrimary} py-2`}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

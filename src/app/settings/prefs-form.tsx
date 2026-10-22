"use client";

import { useActionState } from "react";
import { btnSecondary, inputCls, labelCls } from "@/components/ui";
import { saveNotificationSettings } from "./actions";

export type Prefs = { proposals: boolean; checkin: boolean; checkin_time: string; timezone: string };

export function PrefsForm({ prefs }: { prefs: Prefs }) {
  const [state, action, pending] = useActionState(saveNotificationSettings, { error: null });
  return (
    <form action={action} className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" name="proposals" defaultChecked={prefs.proposals} className="mt-1 accent-emerald-500" />
        <span>
          Proposals to approve
          <span className="block text-xs text-neutral-500">
            One summary when your PT proposes sessions, changes or a new season version (after 2 quiet minutes).
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="checkin" defaultChecked={prefs.checkin} className="mt-1 accent-emerald-500" />
        <span>
          Check-in reminder
          <span className="block text-xs text-neutral-500">Once a day, only if you haven&apos;t checked in yet.</span>
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>
          Reminder time
          <input type="time" name="checkin_time" defaultValue={prefs.checkin_time.slice(0, 5)} className={inputCls} />
        </label>
        <label className={labelCls}>
          Timezone
          <select name="timezone" defaultValue={prefs.timezone} className={inputCls}>
            <option value="Europe/Amsterdam">Amsterdam</option>
            <option value="Europe/Rome">Rome</option>
            <option value="Europe/London">London</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button disabled={pending} className={btnSecondary}>
          {pending ? "…" : state.ok ? "✓ Saved" : "Save"}
        </button>
        {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      </div>
    </form>
  );
}

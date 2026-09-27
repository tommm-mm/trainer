"use client";

import { useActionState } from "react";
import { btnPrimary, btnSecondary, inputCls, labelCls } from "@/components/ui";
import { saveFeedback, skipFeedback } from "./actions";

type Activity = {
  id: string;
  title: string;
  subtitle: string;
};

/** Post-workout check: asks how a synced Garmin session went. */
export function FeedbackCard({ activity }: { activity: Activity }) {
  const [state, action, pending] = useActionState(saveFeedback, { error: null });

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4"
    >
      <input type="hidden" name="activity_id" value={activity.id} />
      <div>
        <p className="text-xs uppercase tracking-wide text-sky-300">How did it go?</p>
        <p className="font-medium">{activity.title}</p>
        <p className="text-xs text-neutral-400">{activity.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className={labelCls}>
          Feeling (1-10)
          <input name="feeling_score" inputMode="numeric" placeholder="7" className={inputCls} />
        </label>
        <label className={labelCls}>
          Effort RPE (1-10)
          <input name="rpe" inputMode="numeric" placeholder="5" className={inputCls} />
        </label>
      </div>
      <label className={labelCls}>
        Notes
        <textarea
          name="notes"
          rows={2}
          placeholder="Legs heavy after km 8, HR high for the pace…"
          className={inputCls}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-neutral-200">
        <input type="checkbox" name="pain" className="h-4 w-4" />
        Pain or something off (flags it for the coach)
      </label>

      {state.error && <p className="text-xs text-red-400">{state.error}</p>}

      <div className="flex gap-2">
        <button disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="submit"
          formAction={skipFeedback.bind(null, activity.id)}
          formNoValidate
          className={btnSecondary}
        >
          Skip
        </button>
      </div>
    </form>
  );
}

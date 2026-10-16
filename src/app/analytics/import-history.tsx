"use client";

import { useState, useTransition } from "react";
import { btnSmall } from "@/components/ui";
import { importHistory } from "./actions";

/**
 * Stats: shown while there are fewer than 12 weeks of activities.
 * Season: 12 months, so a past race can anchor the marathon prediction (`title` + `children`).
 */
export function ImportHistory({
  days,
  since,
  title = "Not much history yet",
  children,
}: {
  days: number;
  since: string | null;
  title?: string;
  children?: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="mb-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
      <p className="font-medium text-sky-200">{title}</p>
      <p className="mb-2 text-xs text-neutral-400">
        {since ? `Activities start on ${since}. ` : ""}
        {children ?? (
          <>
            The 12-week charts and ACWR (which needs 28 days to warm up) fill in with more
            history. Import the last {days} days from Garmin once?
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={btnSmall}
          onClick={() =>
            startTransition(async () => {
              const res = await importHistory(days);
              setMessage(
                res.error
                  ? { ok: false, text: res.error }
                  : {
                      ok: true,
                      text: res.imported
                        ? `Imported ${res.imported} older activities.`
                        : "Nothing older found on intervals.icu.",
                    },
              );
            })
          }
        >
          {pending ? "Importing…" : `↓ Import ${days} days`}
        </button>
        {message && (
          <span className={`text-xs ${message.ok ? "text-emerald-400" : "text-red-400"}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}

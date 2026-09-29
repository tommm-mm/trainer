"use client";

import { useState } from "react";
import { inputCls } from "@/components/ui";

// CR-10 anchors (Foster's session RPE): how hard the whole session was.
const ANCHORS: Record<number, string> = {
  1: "very easy",
  3: "moderate",
  5: "hard",
  7: "very hard",
  9: "near max",
  10: "max",
};

export function FinishSheet({
  totalSets,
  startedAt,
  onFinish,
  onDiscard,
  onCancel,
}: {
  totalSets: number;
  startedAt: string;
  onFinish: (sessionRpe: number | null, notes: string | null) => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [minutes] = useState(() => Math.max(0, Math.round((Date.now() - Date.parse(startedAt)) / 60000)));

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70" onClick={onCancel}>
      <div
        className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-t-2xl border-t border-neutral-800 bg-neutral-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold">Finish workout</h2>
          <p className="text-xs text-neutral-400">
            {minutes} min · {totalSets} working sets
          </p>
        </div>

        <div>
          <p className="mb-1 text-sm">How hard was the whole session? (RPE)</p>
          <div className="grid grid-cols-5 gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setRpe(rpe === n ? null : n)}
                className={`h-12 rounded-lg text-lg font-semibold tabular-nums ${
                  rpe === n ? "bg-emerald-500 text-neutral-950" : "bg-neutral-800 text-neutral-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-1 h-4 text-xs text-neutral-400">
            {rpe !== null ? (ANCHORS[rpe] ?? ANCHORS[rpe - 1] ?? "") : "Feeds your training load (minutes × RPE)."}
          </p>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className={inputCls}
        />

        <button
          onClick={() => onFinish(rpe, notes)}
          className="h-14 rounded-xl bg-emerald-500 text-lg font-semibold text-neutral-950"
        >
          Save workout
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="h-11 flex-1 rounded-lg border border-neutral-700 text-sm">
            Keep training
          </button>
          <button
            onClick={() => {
              if (confirm("Discard this workout and all its sets?")) onDiscard();
            }}
            className="h-11 flex-1 rounded-lg border border-red-500/40 text-sm text-red-300"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
